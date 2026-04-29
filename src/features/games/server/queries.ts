import { createServerFn } from "@tanstack/react-start";
import {
	and,
	asc,
	count,
	desc,
	eq,
	ilike,
	inArray,
	or,
	sql,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import {
	type AnalysisStatus,
	analysisJobs,
	games,
	moves,
	players,
} from "#/db/schema";
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

const gamesFilterSchema = z.object({
	username: z.string().min(1),
	timeControlClass: z
		.enum(["bullet", "blitz", "rapid", "classical", "daily"])
		.optional(),
	result: z.enum(["win", "loss", "draw"]).optional(),
	playerColor: z.enum(["white", "black"]).optional(),
	openingQuery: z.string().trim().min(1).optional(),
});

const sortKeySchema = z.enum([
	"date",
	"opponent",
	"opening",
	"accuracy",
	"score",
]);

const listGamesInput = gamesFilterSchema.extend({
	page: z.number().int().min(1).default(1),
	pageSize: z.number().int().min(1).max(100).default(20),
	sortKey: sortKeySchema.default("date"),
	sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type ListGamesInput = z.infer<typeof listGamesInput>;
export type GamesFilter = z.infer<typeof gamesFilterSchema>;

async function resolvePlayerId(username: string): Promise<string | null> {
	const [player] = await db
		.select({ id: players.id })
		.from(players)
		.where(eq(players.username, username.toLowerCase().trim()));
	return player?.id ?? null;
}

function buildGameConditions(playerId: string, filter: GamesFilter) {
	const conditions = [eq(games.playerId, playerId)];

	if (filter.timeControlClass) {
		conditions.push(eq(games.timeControlClass, filter.timeControlClass));
	}
	if (filter.playerColor) {
		conditions.push(eq(games.playerColor, filter.playerColor));
	}
	if (filter.result) {
		conditions.push(
			inArray(games.resultDetail, getResultDetails(filter.result)),
		);
	}
	if (filter.openingQuery) {
		const q = `%${filter.openingQuery}%`;
		const openingMatch = or(
			ilike(games.openingName, q),
			ilike(games.openingEco, q),
		);
		if (openingMatch) conditions.push(openingMatch);
	}

	return conditions;
}

// Latest analysis_jobs row per game, projected as the columns we need for
// listing/sorting. `DISTINCT ON (game_id) ORDER BY game_id, enqueued_at DESC`.
const latestJobSubquery = db
	.selectDistinctOn([analysisJobs.gameId], {
		gameId: analysisJobs.gameId,
		status: analysisJobs.status,
		accuracyWhite: analysisJobs.accuracyWhite,
		accuracyBlack: analysisJobs.accuracyBlack,
		maiaPredictedWhite: analysisJobs.maiaPredictedWhite,
		maiaPredictedBlack: analysisJobs.maiaPredictedBlack,
	})
	.from(analysisJobs)
	.orderBy(analysisJobs.gameId, desc(analysisJobs.enqueuedAt))
	.as("latest_job");

// Per-color player accuracy/score from the latest job. Used both for output
// and for ORDER BY when the user sorts by accuracy or score.
const playerAccuracyExpr = sql<
	number | null
>`CASE WHEN ${latestJobSubquery.status} = 'complete' THEN
		CASE WHEN ${games.playerColor} = 'white'
			THEN ${latestJobSubquery.accuracyWhite}
			ELSE ${latestJobSubquery.accuracyBlack}
		END
	ELSE NULL END`;

const playerScoreExpr = sql<
	number | null
>`CASE WHEN ${games.playerColor} = 'white'
		THEN ${latestJobSubquery.maiaPredictedWhite}
		ELSE ${latestJobSubquery.maiaPredictedBlack}
	END`;

function orderByForSort(
	sortKey: ListGamesInput["sortKey"],
	sortDir: ListGamesInput["sortDir"],
) {
	const dir = sortDir === "asc" ? asc : desc;
	switch (sortKey) {
		case "opponent":
			return [dir(sql`lower(${games.opponentUsername})`), desc(games.playedAt)];
		case "opening":
			return [
				dir(sql`coalesce(${games.openingName}, ${games.openingEco})`),
				desc(games.playedAt),
			];
		case "accuracy":
			return [dir(sql`${playerAccuracyExpr} NULLS LAST`), desc(games.playedAt)];
		case "score":
			return [dir(sql`${playerScoreExpr} NULLS LAST`), desc(games.playedAt)];
		default:
			return [dir(games.playedAt)];
	}
}

export const listGames = createServerFn({ method: "GET" })
	.inputValidator(listGamesInput)
	.handler(async ({ data }) => {
		const { page, pageSize, sortKey, sortDir, ...filter } = data;

		const playerId = await resolvePlayerId(filter.username);
		if (!playerId) {
			return { items: [], totalCount: 0, page, pageSize };
		}

		const whereClause = and(...buildGameConditions(playerId, filter));
		const offset = (page - 1) * pageSize;

		const [rows, countResult] = await Promise.all([
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
					jobStatus: latestJobSubquery.status,
					overallAccuracy: playerAccuracyExpr,
					maiaPlayerRating: playerScoreExpr,
				})
				.from(games)
				.leftJoin(latestJobSubquery, eq(latestJobSubquery.gameId, games.id))
				.where(whereClause)
				.orderBy(...orderByForSort(sortKey, sortDir))
				.limit(pageSize)
				.offset(offset),
			db.select({ count: count() }).from(games).where(whereClause),
		]);

		const items = rows.map((g) => ({
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
			analysisStatus: toUiStatus(g.jobStatus ?? null),
			overallAccuracy: g.overallAccuracy,
			gameScore:
				g.maiaPlayerRating != null ? Math.round(g.maiaPlayerRating) : null,
		}));

		return {
			items,
			totalCount: countResult[0].count,
			page,
			pageSize,
		};
	});

export const getGamesStats = createServerFn({ method: "GET" })
	.inputValidator(gamesFilterSchema)
	.handler(async ({ data }) => {
		const playerId = await resolvePlayerId(data.username);
		if (!playerId) {
			return {
				totalCount: 0,
				wins: 0,
				draws: 0,
				losses: 0,
				avgAccuracy: null as number | null,
				avgGameScore: null as number | null,
				blunderCount: 0,
			};
		}

		const whereClause = and(...buildGameConditions(playerId, data));

		const winDetails = getResultDetails("win");
		const drawDetails = getResultDetails("draw");
		const lossDetails = getResultDetails("loss");

		const [aggRow, blunderRow] = await Promise.all([
			db
				.select({
					totalCount: count(),
					wins: sql<number>`count(*) FILTER (WHERE ${inArray(games.resultDetail, winDetails)})`,
					draws: sql<number>`count(*) FILTER (WHERE ${inArray(games.resultDetail, drawDetails)})`,
					losses: sql<number>`count(*) FILTER (WHERE ${inArray(games.resultDetail, lossDetails)})`,
					avgAccuracy: sql<number | null>`avg(${playerAccuracyExpr})::float8`,
					avgGameScore: sql<number | null>`avg(${playerScoreExpr})::float8`,
				})
				.from(games)
				.leftJoin(latestJobSubquery, eq(latestJobSubquery.gameId, games.id))
				.where(whereClause),
			db
				.select({ blunderCount: count() })
				.from(moves)
				.innerJoin(games, eq(moves.gameId, games.id))
				.where(
					and(
						whereClause,
						eq(moves.classification, "blunder"),
						eq(moves.isPlayerMove, 1),
					),
				),
		]);

		const a = aggRow[0];
		return {
			totalCount: Number(a.totalCount),
			wins: Number(a.wins),
			draws: Number(a.draws),
			losses: Number(a.losses),
			avgAccuracy: a.avgAccuracy != null ? Number(a.avgAccuracy) : null,
			avgGameScore:
				a.avgGameScore != null ? Math.round(Number(a.avgGameScore)) : null,
			blunderCount: Number(blunderRow[0].blunderCount),
		};
	});
