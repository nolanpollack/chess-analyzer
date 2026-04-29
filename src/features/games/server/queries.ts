import { createServerFn } from "@tanstack/react-start";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { type AnalysisStatus, analysisJobs, games, players } from "#/db/schema";
import { getResultDetails, lookupOpeningName } from "#/lib/chess-utils";

type UiAnalysisStatus = "pending" | "complete" | "failed";

function toUiStatus(status: AnalysisStatus | null): UiAnalysisStatus | null {
	if (status === null) return null;
	if (status === "queued" || status === "running") return "pending";
	return status;
}

export const getGame = createServerFn({ method: "GET" })
	.inputValidator(z.object({ gameId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const { gameId } = data;

		const [game] = await db.select().from(games).where(eq(games.id, gameId));

		if (!game) {
			return null;
		}

		return {
			id: game.id,
			platformGameId: game.platformGameId,
			playedAt: game.playedAt.toISOString(),
			timeControl: game.timeControl,
			timeControlClass: game.timeControlClass,
			resultDetail: game.resultDetail,
			playerColor: game.playerColor,
			playerRating: game.playerRating,
			opponentUsername: game.opponentUsername,
			opponentRating: game.opponentRating,
			openingEco: game.openingEco,
			openingName:
				game.openingName ??
				(game.openingEco ? lookupOpeningName(game.openingEco) : null),
			accuracyWhite: game.accuracyWhite,
			accuracyBlack: game.accuracyBlack,
			analysisStatus: null as UiAnalysisStatus | null,
			overallAccuracy: null as number | null,
			gameScore: null as number | null,
		};
	});

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

		const [player] = await db
			.select({ id: players.id })
			.from(players)
			.where(eq(players.username, username.toLowerCase().trim()));

		if (!player) {
			return { items: [], totalCount: 0, page, pageSize };
		}

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
				})
				.from(games)
				.where(whereClause)
				.orderBy(desc(games.playedAt))
				.limit(pageSize)
				.offset(offset),
			db.select({ count: count() }).from(games).where(whereClause),
		]);

		// Pull the latest analysis job per game in one round-trip via DISTINCT ON.
		const pageGameIds = gameRows.map((g) => g.id);
		const latestJobs =
			pageGameIds.length > 0
				? await db
						.selectDistinctOn([analysisJobs.gameId], {
							gameId: analysisJobs.gameId,
							status: analysisJobs.status,
							accuracyWhite: analysisJobs.accuracyWhite,
							accuracyBlack: analysisJobs.accuracyBlack,
							maiaPredictedWhite: analysisJobs.maiaPredictedWhite,
							maiaPredictedBlack: analysisJobs.maiaPredictedBlack,
						})
						.from(analysisJobs)
						.where(inArray(analysisJobs.gameId, pageGameIds))
						.orderBy(analysisJobs.gameId, desc(analysisJobs.enqueuedAt))
				: [];
		const jobByGameId = new Map(latestJobs.map((j) => [j.gameId, j]));

		const items = gameRows.map((g) => {
			const job = jobByGameId.get(g.id);
			const playerAccuracy =
				job && job.status === "complete"
					? g.playerColor === "white"
						? job.accuracyWhite
						: job.accuracyBlack
					: null;
			// gameScore is the Maia-predicted Elo for the player's side. Surfaces
			// as soon as the Maia step writes it, independent of the legacy
			// Stockfish accuracy/status columns.
			const maiaPlayerRating =
				g.playerColor === "white"
					? (job?.maiaPredictedWhite ?? null)
					: (job?.maiaPredictedBlack ?? null);
			return {
				id: g.id,
				platformGameId: g.platformGameId,
				playedAt: g.playedAt.toISOString(),
				timeControl: g.timeControl,
				timeControlClass: g.timeControlClass,
				resultDetail: g.resultDetail,
				playerColor: g.playerColor,
				playerRating: g.playerRating,
				opponentUsername: g.opponentUsername,
				opponentRating: g.opponentRating,
				openingEco: g.openingEco,
				openingName:
					g.openingName ??
					(g.openingEco ? lookupOpeningName(g.openingEco) : null),
				accuracyWhite: g.accuracyWhite,
				accuracyBlack: g.accuracyBlack,
				analysisStatus: toUiStatus(job?.status ?? null),
				overallAccuracy: playerAccuracy,
				gameScore: maiaPlayerRating != null ? Math.round(maiaPlayerRating) : null,
			};
		});

		return {
			items,
			totalCount: countResult[0].count,
			page,
			pageSize,
		};
	});
