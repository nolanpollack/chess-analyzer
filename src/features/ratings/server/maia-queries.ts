/**
 * Maia-based rating server functions.
 *
 * These wrap `computeMaiaTagRatings` (plain helper in src/lib/scoring/) and
 * the per-game Maia columns on `analysis_jobs`. They are ADDITIVE — the
 * legacy queries.ts is untouched and continues to serve any surfaces not yet
 * migrated.
 *
 * All handlers return discriminated results: success shape OR { error: string }.
 * Never throws from handlers.
 */
import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { analysisJobs } from "#/db/schema";
import { createPositionCache } from "#/lib/position-cache";
import { computeMaiaTagRatings } from "#/lib/scoring/maia-tag-rating";

// ── Tag-slice ratings ─────────────────────────────────────────────────

const tagSliceSchema = z.object({
	playerId: z.string().uuid(),
	dimensionType: z.string(),
	dimensionValue: z.string().optional(),
	windowKey: z.enum(["trailing_20"]).default("trailing_20"),
	/** When provided, restricts to a single game's positions (game-detail view). */
	gameId: z.string().uuid().optional(),
});

export const getMaiaTagRatings = createServerFn({ method: "GET" })
	.inputValidator(tagSliceSchema)
	.handler(async ({ data }) => {
		try {
			const cache = createPositionCache(db);
			const ratings = await computeMaiaTagRatings(db, cache, {
				playerId: data.playerId,
				dimensionType: data.dimensionType,
				dimensionValue: data.dimensionValue,
				windowKey: data.windowKey,
				gameId: data.gameId,
			});
			return { ratings };
		} catch (err) {
			console.error("[getMaiaTagRatings] Error:", err);
			return { error: String(err) };
		}
	});

// ── Per-game Maia rating ──────────────────────────────────────────────

const gameRatingSchema = z.object({ analysisJobId: z.string().uuid() });

export const getMaiaGameRating = createServerFn({ method: "GET" })
	.inputValidator(gameRatingSchema)
	.handler(async ({ data }) => {
		try {
			const [job] = await db
				.select({
					maiaVersion: analysisJobs.maiaVersion,
					maiaPredictedWhite: analysisJobs.maiaPredictedWhite,
					maiaCiLowWhite: analysisJobs.maiaCiLowWhite,
					maiaCiHighWhite: analysisJobs.maiaCiHighWhite,
					maiaNPositionsWhite: analysisJobs.maiaNPositionsWhite,
					maiaPredictedBlack: analysisJobs.maiaPredictedBlack,
					maiaCiLowBlack: analysisJobs.maiaCiLowBlack,
					maiaCiHighBlack: analysisJobs.maiaCiHighBlack,
					maiaNPositionsBlack: analysisJobs.maiaNPositionsBlack,
				})
				.from(analysisJobs)
				.where(eq(analysisJobs.id, data.analysisJobId));

			if (!job) return { error: "Analysis job not found" };

			return {
				maiaVersion: job.maiaVersion,
				white:
					job.maiaPredictedWhite != null
						? {
								predicted: job.maiaPredictedWhite,
								ciLow: job.maiaCiLowWhite ?? job.maiaPredictedWhite,
								ciHigh: job.maiaCiHighWhite ?? job.maiaPredictedWhite,
								nPositions: job.maiaNPositionsWhite ?? 0,
							}
						: null,
				black:
					job.maiaPredictedBlack != null
						? {
								predicted: job.maiaPredictedBlack,
								ciLow: job.maiaCiLowBlack ?? job.maiaPredictedBlack,
								ciHigh: job.maiaCiHighBlack ?? job.maiaPredictedBlack,
								nPositions: job.maiaNPositionsBlack ?? 0,
							}
						: null,
			};
		} catch (err) {
			console.error("[getMaiaGameRating] Error:", err);
			return { error: String(err) };
		}
	});

// ── Latest analysis job ID for a game ─────────────────────────────────

const latestJobSchema = z.object({ gameId: z.string().uuid() });

export const getLatestAnalysisJobId = createServerFn({ method: "GET" })
	.inputValidator(latestJobSchema)
	.handler(async ({ data }) => {
		try {
			const [job] = await db
				.select({ id: analysisJobs.id })
				.from(analysisJobs)
				.where(eq(analysisJobs.gameId, data.gameId))
				.orderBy(desc(analysisJobs.enqueuedAt))
				.limit(1);
			return { analysisJobId: job?.id ?? null };
		} catch (err) {
			console.error("[getLatestAnalysisJobId] Error:", err);
			return { error: String(err) };
		}
	});
