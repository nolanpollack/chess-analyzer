/**
 * Sync progress query — returns counts needed to drive the SyncStatusButton
 * progress strip.
 */
import { createServerFn } from "@tanstack/react-start";
import { and, count, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { analysisJobs, games, players } from "#/db/schema";

export type SyncProgressData = {
	gamesImported: number;
	totalGamesToImport: number;
	gamesAnalyzed: number;
};

export const getPlayerSyncProgress = createServerFn({ method: "GET" })
	.inputValidator(z.object({ username: z.string().min(1) }))
	.handler(async ({ data }) => {
		try {
			const [player] = await db
				.select({ id: players.id })
				.from(players)
				.where(eq(players.username, data.username.toLowerCase().trim()));

			if (!player) return { error: "Player not found" };

			const [importedResult, analyzedResult] = await Promise.all([
				db
					.select({ count: count() })
					.from(games)
					.where(eq(games.playerId, player.id)),
				db
					.select({ count: count() })
					.from(analysisJobs)
					.innerJoin(games, eq(games.id, analysisJobs.gameId))
					.where(
						and(
							eq(games.playerId, player.id),
							eq(analysisJobs.status, "complete"),
							isNotNull(analysisJobs.accuracyWhite),
						),
					),
			]);

			return {
				progress: {
					gamesImported: importedResult[0]?.count ?? 0,
					totalGamesToImport: 0, // unknown at query time
					gamesAnalyzed: analyzedResult[0]?.count ?? 0,
				} satisfies SyncProgressData,
			};
		} catch (err) {
			console.error("[getPlayerSyncProgress] Error:", err);
			return { error: String(err) };
		}
	});
