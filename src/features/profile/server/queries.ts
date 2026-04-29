import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { analysisJobs, games, players } from "#/db/schema";
import {
	aggregateRating,
	aggregateRatingTrend,
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

const DELTA_LOOKBACK_DAYS = 30;

function computeEloDelta30d(
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

			const [gameRows, completedJobs, perGameRatings] = await Promise.all([
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
			]);

			const now = new Date();
			const aggregate = aggregateRating(perGameRatings, { now });
			const eloEstimate = aggregate ? Math.round(aggregate.rating) : null;
			const eloDelta30d =
				aggregate !== null
					? computeEloDelta30d(perGameRatings, now, aggregate.rating)
					: null;

			return {
				summary: {
					playerId: player.id,
					currentRating: gameRows[0]?.playerRating ?? null,
					gameCount: gameRows.length,
					analyzedGameCount: completedJobs.length,
					/** Number of games actually feeding the Elo estimate. */
					eloSampleSize: aggregate?.totalGames ?? 0,
					eloEstimate,
					eloDelta30d,
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

const MAX_TREND_POINTS = 60;

/**
 * Snapshot dates: every game date inside the window, decimated to at most
 * MAX_TREND_POINTS. We snapshot at game dates (not regular calendar ticks)
 * so the curve only moves where data actually changes.
 */
function pickSnapshotDates(games: PerGameRating[], windowStart: Date): Date[] {
	const eligible = games
		.filter((g) => g.playedAt.getTime() >= windowStart.getTime())
		.map((g) => g.playedAt)
		.sort((a, b) => a.getTime() - b.getTime());
	if (eligible.length <= MAX_TREND_POINTS) return eligible;
	const stride = (eligible.length - 1) / (MAX_TREND_POINTS - 1);
	const out: Date[] = [];
	for (let i = 0; i < MAX_TREND_POINTS; i++) {
		out.push(eligible[Math.round(i * stride)]);
	}
	return out;
}

export type RatingTrendPoint = {
	date: string;
	rating: number;
};

export const getRatingTrend = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			playerId: z.string().uuid(),
			range: trendRangeSchema.default("6m"),
		}),
	)
	.handler(async ({ data }) => {
		try {
			const perGameRatings = await fetchPerGameRatings(data.playerId);
			const days = RANGE_DAYS[data.range];
			const now = new Date();
			const windowStart =
				days === null
					? new Date(0)
					: new Date(now.getTime() - days * 86_400_000);

			const snapshots = pickSnapshotDates(perGameRatings, windowStart);
			const trend = aggregateRatingTrend(perGameRatings, snapshots, { now });

			const points: RatingTrendPoint[] = trend.map((p) => ({
				date: p.date.toISOString(),
				rating: Math.round(p.aggregate.rating),
			}));
			return { points };
		} catch (err) {
			console.error("[getRatingTrend] Error:", err);
			return { error: "Failed to load rating trend" };
		}
	});
