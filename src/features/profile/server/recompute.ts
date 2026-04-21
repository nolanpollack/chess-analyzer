import { desc, eq } from "drizzle-orm";
import { db } from "#/db/index";
import {
	gameAnalyses,
	gamePerformance,
	games,
	playerProfile,
} from "#/db/schema";
import {
	aggregatePlayerProfile,
	type GamePerformanceRow,
} from "#/lib/performance";

/**
 * Upserts `player_profile` for `playerId` by aggregating all of the player's
 * `game_performance` rows. Returns the freshly-written row, or null if the
 * player has no analyzed games yet.
 *
 * Shared between profile queries (fallback when no cached row exists) and
 * the refresh mutation. Not a server function — call from other server code.
 */
export async function recomputeProfile(playerId: string) {
	const perfRows = await db
		.select({
			gameAnalysisId: gamePerformance.gameAnalysisId,
			gameId: games.id,
			playedAt: games.playedAt,
			openingEco: games.openingEco,
			openingName: games.openingName,
			overallAccuracy: gamePerformance.overallAccuracy,
			overallAvgCpLoss: gamePerformance.overallAvgCpLoss,
			openingAccuracy: gamePerformance.openingAccuracy,
			openingAvgCpLoss: gamePerformance.openingAvgCpLoss,
			openingMoveCount: gamePerformance.openingMoveCount,
			middlegameAccuracy: gamePerformance.middlegameAccuracy,
			middlegameAvgCpLoss: gamePerformance.middlegameAvgCpLoss,
			middlegameMoveCount: gamePerformance.middlegameMoveCount,
			endgameAccuracy: gamePerformance.endgameAccuracy,
			endgameAvgCpLoss: gamePerformance.endgameAvgCpLoss,
			endgameMoveCount: gamePerformance.endgameMoveCount,
			pieceStats: gamePerformance.pieceStats,
			conceptStats: gamePerformance.conceptStats,
			explainedMoveCount: gamePerformance.explainedMoveCount,
		})
		.from(gamePerformance)
		.innerJoin(
			gameAnalyses,
			eq(gamePerformance.gameAnalysisId, gameAnalyses.id),
		)
		.innerJoin(games, eq(gameAnalyses.gameId, games.id))
		.where(eq(gamePerformance.playerId, playerId))
		.orderBy(desc(games.playedAt));

	if (perfRows.length === 0) {
		return null;
	}

	const rows: GamePerformanceRow[] = perfRows.map((r) => ({
		gameAnalysisId: r.gameAnalysisId,
		gameId: r.gameId,
		playedAt: r.playedAt.toISOString(),
		openingEco: r.openingEco,
		openingName: r.openingName,
		overallAccuracy: r.overallAccuracy,
		overallAvgCpLoss: r.overallAvgCpLoss,
		openingAccuracy: r.openingAccuracy,
		openingAvgCpLoss: r.openingAvgCpLoss,
		openingMoveCount: r.openingMoveCount,
		middlegameAccuracy: r.middlegameAccuracy,
		middlegameAvgCpLoss: r.middlegameAvgCpLoss,
		middlegameMoveCount: r.middlegameMoveCount,
		endgameAccuracy: r.endgameAccuracy,
		endgameAvgCpLoss: r.endgameAvgCpLoss,
		endgameMoveCount: r.endgameMoveCount,
		pieceStats: r.pieceStats,
		conceptStats: r.conceptStats,
		explainedMoveCount: r.explainedMoveCount,
	}));

	const profile = aggregatePlayerProfile(rows);

	const [result] = await db
		.insert(playerProfile)
		.values({
			playerId,
			...profile,
			computedAt: new Date(),
		})
		.onConflictDoUpdate({
			target: playerProfile.playerId,
			set: {
				...profile,
				computedAt: new Date(),
			},
		})
		.returning();

	return result;
}
