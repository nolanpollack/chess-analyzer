/**
 * Sync + analysis progress query — drives the topbar status pill and the
 * "updating" affordances on the profile cards.
 *
 * Counts are computed against the *latest* analysis_jobs row per game
 * (re-analyze creates new rows; we want the one we are actively running).
 */
import { createServerFn } from "@tanstack/react-start";
import { count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { analysisJobs, games, players } from "#/db/schema";

export type SyncProgressData = {
	gamesImported: number;
	totalGamesToImport: number;
	/**
	 * Backwards-compat: number of games whose accuracy stage is complete.
	 * Existing callers (preview route fixtures) used this as "fully analyzed".
	 */
	gamesAnalyzed: number;
	/** Per-stage user-facing counts. */
	accuracyComplete: number;
	gameRatingComplete: number;
	patternsComplete: number;
	/** Total moves analyzed across completed games — drives factor card subtitle. */
	positionsAnalyzed: number;
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

			const [importedResult, latestJobs] = await Promise.all([
				db
					.select({ count: count() })
					.from(games)
					.where(eq(games.playerId, player.id)),
				db
					.selectDistinctOn([analysisJobs.gameId], {
						gameId: analysisJobs.gameId,
						status: analysisJobs.status,
						playerColor: games.playerColor,
						accuracyWhite: analysisJobs.accuracyWhite,
						accuracyBlack: analysisJobs.accuracyBlack,
						maiaPredictedWhite: analysisJobs.maiaPredictedWhite,
						maiaPredictedBlack: analysisJobs.maiaPredictedBlack,
						maiaNPositionsWhite: analysisJobs.maiaNPositionsWhite,
						maiaNPositionsBlack: analysisJobs.maiaNPositionsBlack,
					})
					.from(analysisJobs)
					.innerJoin(games, eq(games.id, analysisJobs.gameId))
					.where(eq(games.playerId, player.id))
					.orderBy(analysisJobs.gameId, desc(analysisJobs.enqueuedAt)),
			]);

			let accuracyComplete = 0;
			let gameRatingComplete = 0;
			let patternsComplete = 0;
			let positionsAnalyzed = 0;

			for (const r of latestJobs) {
				const accuracyDone =
					r.playerColor === "white"
						? r.accuracyWhite != null
						: r.accuracyBlack != null;
				const gameRatingDone =
					r.playerColor === "white"
						? r.maiaPredictedWhite != null
						: r.maiaPredictedBlack != null;

				if (accuracyDone) accuracyComplete++;
				if (gameRatingDone) gameRatingComplete++;
				// "Patterns" surfaces to the user as the final stage — counted only
				// when both accuracy AND game score have landed for this game.
				if (accuracyDone && gameRatingDone && r.status === "complete") {
					patternsComplete++;
				}
				// Player-side position count — drives "Based on N positions" on the
				// factor card, so it must match what feeds the tag-rating aggregator.
				const playerNPositions =
					r.playerColor === "white"
						? r.maiaNPositionsWhite
						: r.maiaNPositionsBlack;
				if (gameRatingDone && playerNPositions != null) {
					positionsAnalyzed += playerNPositions;
				}
			}

			return {
				progress: {
					gamesImported: importedResult[0]?.count ?? 0,
					totalGamesToImport: 0, // unknown at query time
					gamesAnalyzed: accuracyComplete,
					accuracyComplete,
					gameRatingComplete,
					patternsComplete,
					positionsAnalyzed,
				} satisfies SyncProgressData,
			};
		} catch (err) {
			console.error("[getPlayerSyncProgress] Error:", err);
			return { error: String(err) };
		}
	});
