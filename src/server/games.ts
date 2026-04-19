import { createServerFn } from "@tanstack/react-start";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { gameAnalyses, gamePerformance, games, players } from "#/db/schema";
import { getResultDetails, lookupOpeningName } from "#/lib/chess-utils";
import { accuracyToElo } from "#/lib/elo-estimate";

// ── listGames ──────────────────────────────────────────────────────────

const listGamesInput = z.object({
	username: z.string().min(1),
	page: z.number().int().min(1).default(1),
	pageSize: z.number().int().min(1).max(100).default(20),
	timeControlClass: z
		.enum(["bullet", "blitz", "rapid", "classical", "daily"])
		.optional(),
	result: z.enum(["win", "loss", "draw"]).optional(),
	playerColor: z.enum(["white", "black"]).optional(),
});

export type ListGamesInput = z.infer<typeof listGamesInput>;

export const listGames = createServerFn({ method: "GET" })
	.inputValidator(listGamesInput)
	.handler(async ({ data }) => {
		const { username, page, pageSize, timeControlClass, result, playerColor } =
			data;

		try {
			// 1. Find the player
			const [player] = await db
				.select({ id: players.id })
				.from(players)
				.where(eq(players.username, username.toLowerCase().trim()));

			if (!player) {
				return { games: [], totalCount: 0, page, pageSize };
			}

			// 2. Build filter conditions
			const conditions = [eq(games.playerId, player.id)];

			if (timeControlClass) {
				conditions.push(eq(games.timeControlClass, timeControlClass));
			}

			if (playerColor) {
				conditions.push(eq(games.playerColor, playerColor));
			}

			if (result) {
				const resultDetails = getResultDetails(result);
				conditions.push(inArray(games.resultDetail, resultDetails));
			}

			const whereClause = and(...conditions);

			// 3. Query with pagination
			const offset = (page - 1) * pageSize;

			const [gameRows, countResult] = await Promise.all([
				db
					.select({
						id: games.id,
						platformGameId: games.platformGameId,
						playedAt: games.playedAt,
						timeControl: games.timeControl,
						timeControlClass: games.timeControlClass,
						resultDetail: games.resultDetail,
						playerColor: games.playerColor,
						playerRating: games.playerRating,
						opponentUsername: games.opponentUsername,
						opponentRating: games.opponentRating,
						openingEco: games.openingEco,
						openingName: games.openingName,
						accuracyWhite: games.accuracyWhite,
						accuracyBlack: games.accuracyBlack,
						analysisStatus: gameAnalyses.status,
						overallAccuracy: gamePerformance.overallAccuracy,
					})
					.from(games)
					.leftJoin(gameAnalyses, eq(games.id, gameAnalyses.gameId))
					.leftJoin(
						gamePerformance,
						eq(gameAnalyses.id, gamePerformance.gameAnalysisId),
					)
					.where(whereClause)
					.orderBy(desc(games.playedAt))
					.limit(pageSize)
					.offset(offset),
				db.select({ count: count() }).from(games).where(whereClause),
			]);

			// Serialize dates, fill in missing opening names, compute game score
			const serializedGames = gameRows.map((g) => ({
				...g,
				playedAt: g.playedAt.toISOString(),
				openingName:
					g.openingName ??
					(g.openingEco ? lookupOpeningName(g.openingEco) : null),
				gameScore:
					g.overallAccuracy !== null ? accuracyToElo(g.overallAccuracy) : null,
			}));

			return {
				games: serializedGames,
				totalCount: countResult[0].count,
				page,
				pageSize,
			};
		} catch (err) {
			console.error("[listGames] Database error:", err);
			return { error: "Failed to load games" };
		}
	});

// ── getGame ────────────────────────────────────────────────────────────

export const getGame = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			gameId: z.string().uuid(),
		}),
	)
	.handler(async ({ data }) => {
		const { gameId } = data;

		try {
			const [game] = await db.select().from(games).where(eq(games.id, gameId));

			if (!game) {
				return null;
			}

			// Also look up the player username for URL construction
			const [player] = await db
				.select({ username: players.username })
				.from(players)
				.where(eq(players.id, game.playerId));

			return {
				...game,
				playedAt: game.playedAt.toISOString(),
				fetchedAt: game.fetchedAt.toISOString(),
				openingName:
					game.openingName ??
					(game.openingEco ? lookupOpeningName(game.openingEco) : null),
				playerUsername: player?.username ?? null,
			};
		} catch (err) {
			console.error("[getGame] Error:", err);
			return { error: "Failed to load game" };
		}
	});
