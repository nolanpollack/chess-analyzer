import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { players } from "#/db/schema";
import { ensureQueue, getBoss } from "#/lib/queue";
import {
	SYNC_GAMES_QUEUE,
	type SyncGamesPayload,
} from "#/worker/jobs/sync-games";

export const ensurePlayer = createServerFn({ method: "POST" })
	.inputValidator(z.object({ username: z.string().min(1) }))
	.handler(async ({ data }) => {
		const username = data.username.toLowerCase().trim();
		try {
			const [existing] = await db
				.select()
				.from(players)
				.where(eq(players.username, username));
			if (existing) return { playerId: existing.id, created: false };

			const [created] = await db
				.insert(players)
				.values({ username, platform: "chess.com" })
				.returning({ id: players.id });
			return { playerId: created.id, created: true };
		} catch (err) {
			console.error("[ensurePlayer] Error:", err);
			return { error: "Failed to create player" };
		}
	});

export const syncPlayer = createServerFn({ method: "POST" })
	.inputValidator(z.object({ username: z.string().min(1) }))
	.handler(async ({ data }) => {
		const username = data.username.toLowerCase().trim();

		try {
			let [player] = await db
				.select()
				.from(players)
				.where(eq(players.username, username));

			if (!player) {
				const [created] = await db
					.insert(players)
					.values({ username, platform: "chess.com" })
					.returning();
				player = created;
			}

			await enqueueSyncJob(player.id, player.username, player.platform);
			return { enqueued: true };
		} catch (err) {
			console.error("[syncPlayer] Error:", err);
			return { error: "Failed to sync player" };
		}
	});

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
