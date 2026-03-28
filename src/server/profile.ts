import { createServerFn } from "@tanstack/react-start";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import {
	gameAnalyses,
	gamePerformance,
	games,
	playerProfile,
	players,
} from "#/db/schema";
import {
	aggregatePlayerProfile,
	type GamePerformanceRow,
} from "#/lib/performance";

// ── getGamePerformance ────────────────────────────────────────────────

export const getGamePerformance = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			gameAnalysisId: z.string().uuid(),
		}),
	)
	.handler(async ({ data }) => {
		const { gameAnalysisId } = data;

		try {
			const [row] = await db
				.select()
				.from(gamePerformance)
				.where(eq(gamePerformance.gameAnalysisId, gameAnalysisId));

			if (!row) {
				return { performance: null };
			}

			return {
				performance: {
					...row,
					computedAt: row.computedAt.toISOString(),
				},
			};
		} catch (err) {
			console.error("[getGamePerformance] Error:", err);
			return { error: "Failed to load game performance" };
		}
	});

// ── getPlayerProfile ──────────────────────────────────────────────────

export const getPlayerProfile = createServerFn({ method: "GET" })
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
				return { error: "Player not found" };
			}

			// Check for existing profile
			const [existing] = await db
				.select()
				.from(playerProfile)
				.where(eq(playerProfile.playerId, player.id));

			if (existing) {
				return {
					profile: {
						...existing,
						computedAt: existing.computedAt.toISOString(),
					},
				};
			}

			// No profile exists — compute it
			const result = await recomputeProfile(player.id);
			if (!result) {
				return { profile: null };
			}

			return {
				profile: {
					...result,
					computedAt: result.computedAt.toISOString(),
				},
			};
		} catch (err) {
			console.error("[getPlayerProfile] Error:", err);
			return { error: "Failed to load player profile" };
		}
	});

// ── refreshPlayerProfile ──────────────────────────────────────────────

export const refreshPlayerProfile = createServerFn({ method: "POST" })
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
				return { error: "Player not found" };
			}

			const result = await recomputeProfile(player.id);
			if (!result) {
				return { profile: null };
			}

			return {
				profile: {
					...result,
					computedAt: result.computedAt.toISOString(),
				},
			};
		} catch (err) {
			console.error("[refreshPlayerProfile] Error:", err);
			return { error: "Failed to refresh profile" };
		}
	});

// ── getAccuracyTrend ─────────────────────────────────────────────────

export const getAccuracyTrend = createServerFn({ method: "GET" })
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
				return { error: "Player not found" };
			}

			const rows = await db
				.select({
					gameId: games.id,
					playedAt: games.playedAt,
					accuracy: gamePerformance.overallAccuracy,
					opponent: games.opponentUsername,
				})
				.from(gamePerformance)
				.innerJoin(
					gameAnalyses,
					eq(gamePerformance.gameAnalysisId, gameAnalyses.id),
				)
				.innerJoin(games, eq(gameAnalyses.gameId, games.id))
				.where(eq(gamePerformance.playerId, player.id))
				.orderBy(asc(games.playedAt));

			return {
				trend: rows.map((r) => ({
					gameId: r.gameId,
					playedAt: r.playedAt.toISOString(),
					accuracy: r.accuracy,
					opponent: r.opponent,
				})),
			};
		} catch (err) {
			console.error("[getAccuracyTrend] Error:", err);
			return { error: "Failed to load accuracy trend" };
		}
	});

// ── Helpers ───────────────────────────────────────────────────────────

async function recomputeProfile(playerId: string) {
	// Load all game_performance rows with game metadata
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

	// Map to GamePerformanceRow
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

	// Upsert player_profile
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
