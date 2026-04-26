import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { analysisJobs, games } from "#/db/schema";
import { gameAccuracyToElo } from "#/lib/elo-estimate";

/**
 * Player overall accuracy + rating, computed as a simple mean of per-game
 * Lichess accuracy over a window of recent games.
 *
 * Each game contributes one data point regardless of length, avoiding bias
 * toward long endgames that would occur with move-count weighting.
 *
 * Lives in `src/lib/scoring/` (plain function, not a server fn) so any
 * feature can compose it without crossing a feature boundary. Both
 * `features/profile/server/queries.ts` (for EloEstimateCard) and
 * `features/ratings/server/queries.ts` (for the public overall-rating
 * server fn) use this.
 */

const DEFAULT_WINDOW_GAMES = 20;
/** Used as a fallback when the player has no analyzed games yet. */
const DEFAULT_PRIOR_ACCURACY = 70;

export type PlayerOverall = {
	overallAccuracy: number;
	ratingEstimate: number;
	sampleSize: number;
};

export async function getPlayerOverall(
	// biome-ignore lint/suspicious/noExplicitAny: schema-agnostic Drizzle instance
	db: NodePgDatabase<any>,
	playerId: string,
	windowGames = DEFAULT_WINDOW_GAMES,
): Promise<PlayerOverall> {
	const rows = await db
		.select({
			playerColor: games.playerColor,
			timeControl: games.timeControl,
			accuracyWhite: analysisJobs.accuracyWhite,
			accuracyBlack: analysisJobs.accuracyBlack,
		})
		.from(games)
		.innerJoin(analysisJobs, eq(games.id, analysisJobs.gameId))
		.where(
			and(
				eq(games.playerId, playerId),
				isNotNull(analysisJobs.accuracyWhite),
				isNotNull(analysisJobs.accuracyBlack),
			),
		)
		.orderBy(desc(games.playedAt))
		.limit(windowGames);

	if (rows.length === 0) {
		return {
			overallAccuracy: DEFAULT_PRIOR_ACCURACY,
			ratingEstimate: gameAccuracyToElo(DEFAULT_PRIOR_ACCURACY, "600+0"),
			sampleSize: 0,
		};
	}

	const gameAccuracies = rows.map((r) =>
		r.playerColor === "white" ? (r.accuracyWhite ?? 0) : (r.accuracyBlack ?? 0),
	);
	const overallAccuracy =
		gameAccuracies.reduce((a, b) => a + b, 0) / gameAccuracies.length;

	// Average per-game Elo scores (each already calibrated to its time control)
	// rather than converting the mean accuracy, so blitz and rapid games
	// contribute comparably without mixing their accuracy scales.
	const ratingEstimate =
		rows.reduce((sum, r) => {
			const accuracy =
				r.playerColor === "white"
					? (r.accuracyWhite ?? 0)
					: (r.accuracyBlack ?? 0);
			return sum + gameAccuracyToElo(accuracy, r.timeControl);
		}, 0) / rows.length;

	return {
		overallAccuracy,
		ratingEstimate: Math.round(ratingEstimate),
		sampleSize: rows.length,
	};
}
