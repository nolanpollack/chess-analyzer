import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { games, moves } from "#/db/schema";
import { accuracyToRating } from "#/lib/scoring/rating-mapping";

/**
 * Player overall accuracy + rating, computed from `moves.accuracyScore`
 * over a window of recent games.
 *
 * Lives in `src/lib/scoring/` (plain function, not a server fn) so any
 * feature can compose it without crossing a feature boundary. Both
 * `features/profile/server/queries.ts` (for EloEstimateCard) and
 * `features/ratings/server/queries.ts` (for the public overall-rating
 * server fn) use this.
 */

const DEFAULT_WINDOW_GAMES = 20;
/** Used as a fallback Elo when the player has no analyzed moves yet. */
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
	const gameRows = await db
		.select({ id: games.id })
		.from(games)
		.where(eq(games.playerId, playerId))
		.orderBy(desc(games.playedAt))
		.limit(windowGames);
	const gameIds = gameRows.map((g) => g.id);
	if (gameIds.length === 0) {
		return {
			overallAccuracy: DEFAULT_PRIOR_ACCURACY,
			ratingEstimate: accuracyToRating(DEFAULT_PRIOR_ACCURACY),
			sampleSize: 0,
		};
	}
	const [row] = await db
		.select({
			avg: sql<number | null>`avg(${moves.accuracyScore})::float`,
			count: sql<number>`count(*)::int`,
		})
		.from(moves)
		.where(
			and(
				eq(moves.playerId, playerId),
				eq(moves.isPlayerMove, 1),
				inArray(moves.gameId, gameIds),
				sql`${moves.accuracyScore} is not null`,
			),
		);
	const sampleSize = row?.count ?? 0;
	const overallAccuracy = row?.avg ?? DEFAULT_PRIOR_ACCURACY;
	return {
		overallAccuracy,
		ratingEstimate: accuracyToRating(overallAccuracy),
		sampleSize,
	};
}
