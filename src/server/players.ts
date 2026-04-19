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

// TODO: Remove or figure out how we should really do this
// export const registerPlayer = createServerFn({ method: "POST" })
// 	.inputValidator(
// 		z.object({
// 			username: z.string().min(1).max(50),
// 		}),
// 	)
// 	.handler(async ({ data }) => {
// 		const { username } = data;
// 		const normalizedUsername = username.toLowerCase().trim();
//
// 		try {
// 			// 1. Check if player already exists
// 			const [existing] = await db
// 				.select()
// 				.from(players)
// 				.where(eq(players.username, normalizedUsername));
//
// 			if (existing) {
// 				// Player exists — enqueue a re-sync and redirect
// 				await enqueueSyncJob(
// 					existing.id,
// 					normalizedUsername,
// 					existing.platform,
// 				);
// 				return { username: normalizedUsername, isNew: false };
// 			}
//
// 			// 2. Verify the username exists on chess.com
// 			const exists = await verifyChessComPlayer(normalizedUsername);
// 			if (!exists) {
// 				return { error: "Player not found on chess.com" };
// 			}
//
// 			// 3. Insert new player
// 			const [newPlayer] = await db
// 				.insert(players)
// 				.values({
// 					username: normalizedUsername,
// 					platform: "chess.com",
// 				})
// 				.returning();
//
// 			// 4. Enqueue sync job
// 			await enqueueSyncJob(
// 				newPlayer.id,
// 				normalizedUsername,
// 				newPlayer.platform,
// 			);
//
// 			return { username: normalizedUsername, isNew: true };
// 		} catch (err) {
// 			console.error("[registerPlayer] Error:", err);
// 			return { error: "Failed to register player" };
// 		}
// 	});
//
// // ── getPlayerStatus ────────────────────────────────────────────────────
//
//
// // ── syncPlayer ─────────────────────────────────────────────────────────
//
// // ── Helpers ────────────────────────────────────────────────────────────
//
// async function enqueueSyncJob(
// 	playerId: string,
// 	username: string,
// 	platform: "chess.com" | "lichess",
// ) {
// 	await ensureQueue(SYNC_GAMES_QUEUE);
// 	const boss = await getBoss();
// 	await boss.send(SYNC_GAMES_QUEUE, {
// 		playerId,
// 		username,
// 		platform,
// 	} satisfies SyncGamesPayload);
// }
