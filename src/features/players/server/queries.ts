import { createServerFn } from "@tanstack/react-start";
import { eq, sql } from "drizzle-orm";
import z from "zod";
import { db } from "#/db/index";
import { players } from "#/db/schema";
import { SYNC_GAMES_QUEUE } from "#/worker/jobs/sync-games";

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
			// - Otherwise query pgboss directly for queued OR active jobs.
			//   findJobs({ queued: true }) only matches state < 'active', so it
			//   misses jobs the worker has already picked up. Raw SQL catches all
			//   live states ('created', 'retry', 'active').
			let isSyncing = player.lastSyncedAt === null;

			if (!isSyncing) {
				const result = await db.execute(sql`
					SELECT COUNT(*)::int AS count
					FROM pgboss.job
					WHERE name = ${SYNC_GAMES_QUEUE}
					AND state IN ('created', 'retry', 'active')
					AND data->>'playerId' = ${player.id}
				`);
				isSyncing = (result.rows[0]?.count as number) > 0;
			}

			return {
				found: true as const,
				player: {
					id: player.id,
					username: player.username,
					lastSyncedAt: player.lastSyncedAt?.toISOString() ?? null,
				},
				isSyncing,
			};
		} catch (err) {
			console.error("[getPlayerStatus] Error:", err);
			return { error: "Failed to get player status" };
		}
	});
