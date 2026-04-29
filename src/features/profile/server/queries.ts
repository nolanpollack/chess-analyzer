/**
 * Profile queries — Phase 1 stub.
 *
 * The previous implementation depended on `gamePerformance` and
 * `playerProfile` tables which were dropped in the dimensional-ratings
 * refactor (see docs/dimensional-ratings-plan.md). This file exposes the
 * server fns that consumer hooks still import (`getPlayerSummary`,
 * `getRatingTrend`) but with empty / minimal returns until the scoring
 * engine lands in Phase 3.
 */
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { analysisJobs, games, players } from "#/db/schema";
import { getPlayerOverall } from "#/lib/scoring/overall";

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

			const [gameRows, completedJobs] = await Promise.all([
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
			]);

			const currentRating = gameRows[0]?.playerRating ?? null;

			const overall = await getPlayerOverall(db, player.id);
			const eloEstimate =
				overall.sampleSize > 0 ? overall.ratingEstimate : null;

			return {
				summary: {
					playerId: player.id,
					currentRating,
					gameCount: gameRows.length,
					analyzedGameCount: completedJobs.length,
					eloEstimate,
					// TODO — needs historical rating snapshots
					eloDelta30d: null as number | null,
				},
			};
		} catch (err) {
			console.error("[getPlayerSummary] Error:", err);
			return { error: "Failed to load player summary" };
		}
	});

const trendRangeSchema = z.enum(["1m", "3m", "6m", "1y", "all"]);
export type TrendRange = z.infer<typeof trendRangeSchema>;

export type RatingTrendWeek = {
	weekStart: string;
	rating: number;
	gameCount: number;
};

export const getRatingTrend = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			username: z.string().min(1),
			range: trendRangeSchema.default("6m"),
		}),
	)
	.handler(async ({ data: _data }) => {
		// TODO Phase 3 — compute weekly rating trend from scoring engine output
		return { weeks: [] as RatingTrendWeek[] };
	});

// ── Maia rating trend ────────────────────────────────────────────────────

export type MaiaRatingTrendPoint = {
	playedAt: string;
	predicted: number;
	ciLow: number;
	ciHigh: number;
};

export type MaiaRatingSide = "white" | "black";

const maiaRatingTrendSchema = z.object({
	playerId: z.string().uuid(),
	side: z.enum(["white", "black"]),
	limit: z.number().int().min(1).max(200).default(50),
});

/**
 * Returns per-game Maia predicted rating for a player on a given side,
 * ordered ascending by played_at so charts render left-to-right.
 * Only games with a completed Maia estimate for the requested side are included.
 */
export const getMaiaRatingTrend = createServerFn({ method: "GET" })
	.inputValidator(maiaRatingTrendSchema)
	.handler(async ({ data }) => {
		try {
			const predicted =
				data.side === "white"
					? analysisJobs.maiaPredictedWhite
					: analysisJobs.maiaPredictedBlack;
			const ciLow =
				data.side === "white"
					? analysisJobs.maiaCiLowWhite
					: analysisJobs.maiaCiLowBlack;
			const ciHigh =
				data.side === "white"
					? analysisJobs.maiaCiHighWhite
					: analysisJobs.maiaCiHighBlack;

			// Get the most recent N games for this player/side, then sort ascending.
			const rows = await db
				.select({
					playedAt: games.playedAt,
					predicted,
					ciLow,
					ciHigh,
				})
				.from(games)
				.innerJoin(analysisJobs, eq(games.id, analysisJobs.gameId))
				.where(
					and(
						eq(games.playerId, data.playerId),
						eq(games.playerColor, data.side),
						isNotNull(predicted),
					),
				)
				.orderBy(desc(games.playedAt))
				.limit(data.limit);

			// Reverse so the chart renders oldest-to-newest
			const sorted = rows.slice().reverse();

			return {
				points: sorted.map((r) => ({
					playedAt: r.playedAt.toISOString(),
					predicted: r.predicted as number,
					ciLow: (r.ciLow ?? r.predicted) as number,
					ciHigh: (r.ciHigh ?? r.predicted) as number,
				})) as MaiaRatingTrendPoint[],
			};
		} catch (err) {
			console.error("[getMaiaRatingTrend] Error:", err);
			return { error: "Failed to load Maia rating trend" };
		}
	});
