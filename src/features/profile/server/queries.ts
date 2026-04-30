import { createServerFn } from "@tanstack/react-start";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import {
	analysisJobs,
	games,
	type Platform,
	players,
	type TimeControlClass,
} from "#/db/schema";
import {
	aggregateRating,
	type PerGameRating,
} from "#/lib/rating-aggregator/recency";

const PER_GAME_FETCH_LIMIT = 500;

/**
 * Per-game player-side rating rows, ordered descending by playedAt.
 * Selects the maia prediction matching the player's color in each game.
 */
async function fetchPerGameRatings(playerId: string): Promise<PerGameRating[]> {
	const rows = await db
		.select({
			playerColor: games.playerColor,
			playedAt: games.playedAt,
			predictedWhite: analysisJobs.maiaPredictedWhite,
			predictedBlack: analysisJobs.maiaPredictedBlack,
			ciLowWhite: analysisJobs.maiaCiLowWhite,
			ciHighWhite: analysisJobs.maiaCiHighWhite,
			ciLowBlack: analysisJobs.maiaCiLowBlack,
			ciHighBlack: analysisJobs.maiaCiHighBlack,
		})
		.from(games)
		.innerJoin(analysisJobs, eq(games.id, analysisJobs.gameId))
		.where(
			and(
				eq(games.playerId, playerId),
				sql`${analysisJobs.maiaPredictedWhite} IS NOT NULL OR ${analysisJobs.maiaPredictedBlack} IS NOT NULL`,
			),
		)
		.orderBy(desc(games.playedAt))
		.limit(PER_GAME_FETCH_LIMIT);

	const out: PerGameRating[] = [];
	for (const r of rows) {
		const isWhite = r.playerColor === "white";
		const rating = isWhite ? r.predictedWhite : r.predictedBlack;
		const ciLow = isWhite ? r.ciLowWhite : r.ciLowBlack;
		const ciHigh = isWhite ? r.ciHighWhite : r.ciHighBlack;
		if (rating == null) continue;
		out.push({
			rating,
			ciLow: ciLow ?? rating,
			ciHigh: ciHigh ?? rating,
			playedAt: r.playedAt,
		});
	}
	return out;
}

// ── Imported ratings (per platform × time-control class) ───────────────

export type ImportedFormat = {
	timeControlClass: TimeControlClass;
	rating: number;
	games: number;
};

export type ImportedSource = {
	platform: Platform;
	totalGames: number;
	formats: ImportedFormat[];
};

const TIME_CONTROL_ORDER: TimeControlClass[] = [
	"bullet",
	"blitz",
	"rapid",
	"classical",
	"daily",
];

async function fetchImportedRatings(
	playerId: string,
): Promise<ImportedSource[]> {
	const [latestRows, countRows] = await Promise.all([
		db
			.selectDistinctOn([games.platform, games.timeControlClass], {
				platform: games.platform,
				timeControlClass: games.timeControlClass,
				rating: games.playerRating,
			})
			.from(games)
			.where(eq(games.playerId, playerId))
			.orderBy(games.platform, games.timeControlClass, desc(games.playedAt)),
		db
			.select({
				platform: games.platform,
				timeControlClass: games.timeControlClass,
				gameCount: count(),
			})
			.from(games)
			.where(eq(games.playerId, playerId))
			.groupBy(games.platform, games.timeControlClass),
	]);

	const countByKey = new Map<string, number>();
	for (const r of countRows) {
		countByKey.set(`${r.platform}:${r.timeControlClass}`, r.gameCount);
	}

	const formatsByPlatform = new Map<Platform, ImportedFormat[]>();
	for (const r of latestRows) {
		const list = formatsByPlatform.get(r.platform) ?? [];
		list.push({
			timeControlClass: r.timeControlClass,
			rating: r.rating,
			games: countByKey.get(`${r.platform}:${r.timeControlClass}`) ?? 0,
		});
		formatsByPlatform.set(r.platform, list);
	}

	const sources: ImportedSource[] = [];
	for (const [platform, formats] of formatsByPlatform) {
		formats.sort(
			(a, b) =>
				TIME_CONTROL_ORDER.indexOf(a.timeControlClass) -
				TIME_CONTROL_ORDER.indexOf(b.timeControlClass),
		);
		const totalGames = formats.reduce((s, f) => s + f.games, 0);
		sources.push({ platform, totalGames, formats });
	}
	sources.sort((a, b) => a.platform.localeCompare(b.platform));
	return sources;
}

const DELTA_LOOKBACK_DAYS = 30;

function computeRatingDelta30d(
	games: PerGameRating[],
	now: Date,
	current: number,
): number | null {
	const past = new Date(now.getTime() - DELTA_LOOKBACK_DAYS * 86_400_000);
	const eligible = games.filter((g) => g.playedAt.getTime() <= past.getTime());
	if (eligible.length === 0) return null;
	const prior = aggregateRating(eligible, { now: past });
	if (prior === null) return null;
	return Math.round(current - prior.rating);
}

export const getPlayerSummary = createServerFn({ method: "GET" })
	.inputValidator(z.object({ username: z.string().min(1) }))
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

			const [gameRows, completedJobs, perGameRatings, importedRatings] =
				await Promise.all([
					db
						.select({ playerRating: games.playerRating })
						.from(games)
						.where(eq(games.playerId, player.id))
						.orderBy(desc(games.playedAt)),
					db
						.select({ id: analysisJobs.id })
						.from(analysisJobs)
						.innerJoin(games, eq(games.id, analysisJobs.gameId))
						.where(eq(games.playerId, player.id)),
					fetchPerGameRatings(player.id),
					fetchImportedRatings(player.id),
				]);

			const now = new Date();
			const aggregate = aggregateRating(perGameRatings, { now });
			const playerRating = aggregate ? Math.round(aggregate.rating) : null;
			const playerRatingDelta30d =
				aggregate !== null
					? computeRatingDelta30d(perGameRatings, now, aggregate.rating)
					: null;

			return {
				summary: {
					playerId: player.id,
					/** Most recent platform-supplied rating from the game stream. */
					currentRating: gameRows[0]?.playerRating ?? null,
					gameCount: gameRows.length,
					analyzedGameCount: completedJobs.length,
					/** Computed player-level rating (Maia-aggregated, Elo scale). */
					playerRating,
					/** Number of games feeding the player rating. */
					playerRatingSampleSize: aggregate?.totalGames ?? 0,
					/** Player rating delta over the past 30 days. */
					playerRatingDelta30d,
					importedRatings,
				},
			};
		} catch (err) {
			console.error("[getPlayerSummary] Error:", err);
			return { error: "Failed to load player summary" };
		}
	});

// ── Rating-over-time trend ───────────────────────────────────────────────

const trendRangeSchema = z.enum(["1m", "3m", "6m", "1y", "all"]);
export type TrendRange = z.infer<typeof trendRangeSchema>;

const RANGE_DAYS: Record<TrendRange, number | null> = {
	"1m": 30,
	"3m": 90,
	"6m": 180,
	"1y": 365,
	all: null,
};

const MS_PER_DAY = 86_400_000;

function utcMidnight(d: Date): Date {
	return new Date(
		Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
	);
}

function utcDayKey(d: Date): string {
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export type RatingTrendPoint = {
	date: string;
	rating: number;
};

export type RatingTrendResult = {
	points: RatingTrendPoint[];
	firstGameDate: string | null;
	lastGameDate: string | null;
};

/**
 * One point per calendar day from the first in-window game through today.
 * Aggregator runs only on days that had ≥1 game; other days carry forward
 * the previous day's rating.
 */
function buildDailyTrend(
	perGameRatings: PerGameRating[],
	windowStart: Date,
	now: Date,
): RatingTrendResult {
	const inWindow = perGameRatings
		.filter((g) => g.playedAt.getTime() >= windowStart.getTime())
		.sort((a, b) => a.playedAt.getTime() - b.playedAt.getTime());
	if (inWindow.length === 0) {
		return { points: [], firstGameDate: null, lastGameDate: null };
	}

	const firstGame = inWindow[0]?.playedAt;
	const lastGame = inWindow[inWindow.length - 1]?.playedAt;
	if (!firstGame || !lastGame) {
		return { points: [], firstGameDate: null, lastGameDate: null };
	}
	const gameDays = new Set(inWindow.map((g) => utcDayKey(g.playedAt)));

	const displayStart = utcMidnight(firstGame);
	const displayEnd = utcMidnight(now);

	const points: RatingTrendPoint[] = [];
	let lastRating: number | null = null;

	for (
		let t = displayStart.getTime();
		t <= displayEnd.getTime();
		t += MS_PER_DAY
	) {
		const day = new Date(t);
		const endOfDay = new Date(t + MS_PER_DAY - 1);
		const key = utcDayKey(day);

		if (gameDays.has(key)) {
			const eligible = perGameRatings.filter(
				(g) => g.playedAt.getTime() <= endOfDay.getTime(),
			);
			const aggregate = aggregateRating(eligible, { now: endOfDay });
			if (aggregate !== null) lastRating = Math.round(aggregate.rating);
		}

		if (lastRating !== null) {
			points.push({ date: day.toISOString(), rating: lastRating });
		}
	}

	return {
		points,
		firstGameDate: firstGame.toISOString(),
		lastGameDate: lastGame.toISOString(),
	};
}

export const getRatingTrend = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			playerId: z.string().uuid(),
			range: trendRangeSchema.default("6m"),
		}),
	)
	.handler(async ({ data }): Promise<RatingTrendResult | { error: string }> => {
		try {
			const perGameRatings = await fetchPerGameRatings(data.playerId);
			const days = RANGE_DAYS[data.range];
			const now = new Date();
			const windowStart =
				days === null
					? new Date(0)
					: new Date(now.getTime() - days * MS_PER_DAY);

			return buildDailyTrend(perGameRatings, windowStart, now);
		} catch (err) {
			console.error("[getRatingTrend] Error:", err);
			return { error: "Failed to load rating trend" };
		}
	});
