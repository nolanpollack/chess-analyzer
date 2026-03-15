import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { players } from "#/db/schema";
import { ensureQueue, getBoss } from "#/lib/queue";
import { verifyChessComPlayer } from "#/providers/chess-com-provider";
import {
	SYNC_GAMES_QUEUE,
	type SyncGamesPayload,
} from "#/worker/jobs/sync-games";

// ── registerPlayer ─────────────────────────────────────────────────────

export const registerPlayer = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			username: z.string().min(1).max(50),
		}),
	)
	.handler(async ({ data }) => {
		const { username } = data;
		const normalizedUsername = username.toLowerCase().trim();

		try {
			// 1. Check if player already exists
			const [existing] = await db
				.select()
				.from(players)
				.where(eq(players.username, normalizedUsername));

			if (existing) {
				// Player exists — enqueue a re-sync and redirect
				await enqueueSyncJob(
					existing.id,
					normalizedUsername,
					existing.platform,
				);
				return { username: normalizedUsername, isNew: false };
			}

			// 2. Verify the username exists on chess.com
			const exists = await verifyChessComPlayer(normalizedUsername);
			if (!exists) {
				return { error: "Player not found on chess.com" };
			}

			// 3. Insert new player
			const [newPlayer] = await db
				.insert(players)
				.values({
					username: normalizedUsername,
					platform: "chess.com",
				})
				.returning();

			// 4. Enqueue sync job
			await enqueueSyncJob(
				newPlayer.id,
				normalizedUsername,
				newPlayer.platform,
			);

			return { username: normalizedUsername, isNew: true };
		} catch (err) {
			console.error("[registerPlayer] Error:", err);
			return { error: "Failed to register player" };
		}
	});

// ── getPlayerStatus ────────────────────────────────────────────────────

export const getPlayerStatus = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			username: z.string().min(1),
		}),
	)
	.handler(async ({ data }) => {
		const { username } = data;

		try {
			const [player] = await db
				.select()
				.from(players)
				.where(eq(players.username, username.toLowerCase().trim()));

			if (!player) {
				return { found: false as const };
			}

			// Determine sync status:
			// - If lastSyncedAt is null, initial sync hasn't completed yet
			// - Otherwise check for queued/active jobs via findJobs
			let isSyncing = player.lastSyncedAt === null;

			if (!isSyncing) {
				await ensureQueue(SYNC_GAMES_QUEUE);
				const boss = await getBoss();
				const pendingJobs = await boss.findJobs<SyncGamesPayload>(
					SYNC_GAMES_QUEUE,
					{
						queued: true,
						data: { playerId: player.id },
					},
				);
				isSyncing = pendingJobs.length > 0;
			}

			return {
				found: true as const,
				player: {
					id: player.id,
					username: player.username,
					platform: player.platform,
					lastSyncedAt: player.lastSyncedAt?.toISOString() ?? null,
				},
				isSyncing,
			};
		} catch (err) {
			console.error("[getPlayerStatus] Error:", err);
			return { error: "Failed to get player status" };
		}
	});

// ── syncPlayer ─────────────────────────────────────────────────────────

export const syncPlayer = createServerFn({ method: "POST" })
	.inputValidator(z.object({ username: z.string().min(1) }))
	.handler(async ({ data }) => {
		const { username } = data;

		try {
			const [player] = await db
				.select()
				.from(players)
				.where(eq(players.username, username.toLowerCase().trim()));

			if (!player) {
				return { error: "Player not found" };
			}

			await enqueueSyncJob(player.id, player.username, player.platform);
			return { enqueued: true };
		} catch (err) {
			console.error("[syncPlayer] Error:", err);
			return { error: "Failed to sync player" };
		}
	});

// ── Helpers ────────────────────────────────────────────────────────────

async function enqueueSyncJob(
	playerId: string,
	username: string,
	platform: "chess.com" | "lichess",
) {
	await ensureQueue(SYNC_GAMES_QUEUE);
	const boss = await getBoss();
	await boss.send(SYNC_GAMES_QUEUE, {
		playerId,
		username,
		platform,
	} satisfies SyncGamesPayload);
}
