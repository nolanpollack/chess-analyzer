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
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { analysisJobs, games, players } from "#/db/schema";

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

			return {
				summary: {
					currentRating,
					gameCount: gameRows.length,
					analyzedGameCount: completedJobs.length,
					// TODO Phase 3 — derive from scoring engine (overall accuracy → Elo)
					eloEstimate: null as number | null,
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
