/**
 * Scoring engine — reads the tag store, applies shrinkage, maps to Elo.
 *
 * Layer order (do not reorder; do not skip a layer):
 *   1. SQL aggregate over move_tags ⨝ moves (raw accuracy + sample size)
 *   2. Bayesian shrinkage toward player overall accuracy (lib/scoring/shrinkage)
 *   3. Accuracy → rating mapping (lib/scoring/rating-mapping)
 *
 * The cache (`dimension_score_cache`) is lazy-filled at bucket granularity:
 * (player_id, dimension_type, window_key) is the bucket. Cache rows are
 * written for every dimension_value that has ≥1 tagged move. Invalidation
 * is player-scoped and happens in analyze-game on completion.
 */
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { type DimensionType, isDimensionType } from "#/config/dimensions";
import { db } from "#/db/index";
import {
	dimensionScoreCache,
	games,
	moves,
	moveTags,
	players,
} from "#/db/schema";
import { invalidatePlayerCache as invalidatePlayerCacheImpl } from "#/lib/scoring/cache";
import { accuracyToRating } from "#/lib/scoring/rating-mapping";
import { applyShrinkage } from "#/lib/scoring/shrinkage";

// ── Tunables ──────────────────────────────────────────────────────────

const WINDOW_TRAILING_20 = "trailing_20" as const;
const WINDOW_GAME_COUNT = 20;
const SHRINKAGE_K = 50;
/** Used as the player overall-accuracy prior when they have no analyzed moves. */
const DEFAULT_PRIOR_ACCURACY = 70;

const windowKeySchema = z.enum([WINDOW_TRAILING_20]);
type WindowKey = z.infer<typeof windowKeySchema>;

// ── Public types ──────────────────────────────────────────────────────

export type DimensionScore = {
	dimensionType: DimensionType;
	dimensionValue: string;
	rawAccuracy: number;
	adjustedAccuracy: number;
	sampleSize: number;
	ratingEstimate: number;
};

// ── Window resolution ─────────────────────────────────────────────────

async function getWindowGameIds(
	playerId: string,
	_windowKey: WindowKey,
): Promise<string[]> {
	const rows = await db
		.select({ id: games.id })
		.from(games)
		.where(eq(games.playerId, playerId))
		.orderBy(desc(games.playedAt))
		.limit(WINDOW_GAME_COUNT);
	return rows.map((r) => r.id);
}

// ── Aggregation (raw layer) ───────────────────────────────────────────

async function getPlayerOverallAccuracy(
	playerId: string,
	gameIds: string[],
): Promise<number> {
	if (gameIds.length === 0) return DEFAULT_PRIOR_ACCURACY;
	const [row] = await db
		.select({
			avg: sql<number | null>`avg(${moves.accuracyScore})::float`,
		})
		.from(moves)
		.where(
			and(
				eq(moves.playerId, playerId),
				eq(moves.isPlayerMove, 1),
				inArray(moves.gameId, gameIds),
				sql`${moves.accuracyScore} is not null`,
			),
		);
	return row?.avg ?? DEFAULT_PRIOR_ACCURACY;
}

type RawDimAgg = { dimensionValue: string; avg: number; count: number };

async function aggregateDimension(
	playerId: string,
	gameIds: string[],
	dimType: DimensionType,
): Promise<RawDimAgg[]> {
	if (gameIds.length === 0) return [];
	const rows = await db
		.select({
			dimensionValue: moveTags.dimensionValue,
			avg: sql<number>`avg(${moves.accuracyScore})::float`,
			count: sql<number>`count(*)::int`,
		})
		.from(moveTags)
		.innerJoin(moves, eq(moves.id, moveTags.moveId))
		.where(
			and(
				eq(moveTags.playerId, playerId),
				eq(moveTags.dimensionType, dimType),
				inArray(moveTags.gameId, gameIds),
				eq(moves.isPlayerMove, 1),
				sql`${moves.accuracyScore} is not null`,
			),
		)
		.groupBy(moveTags.dimensionValue);
	return rows;
}

function scoreOne(
	dimType: DimensionType,
	raw: RawDimAgg,
	prior: number,
): DimensionScore {
	const adjusted = applyShrinkage({
		raw: raw.avg,
		sampleSize: raw.count,
		prior,
		k: SHRINKAGE_K,
	});
	return {
		dimensionType: dimType,
		dimensionValue: raw.dimensionValue,
		rawAccuracy: raw.avg,
		adjustedAccuracy: adjusted,
		sampleSize: raw.count,
		ratingEstimate: accuracyToRating(adjusted),
	};
}

// ── Cache (read / write at bucket granularity) ────────────────────────

async function readCachedBucket(
	playerId: string,
	dimType: DimensionType,
	windowKey: WindowKey,
): Promise<DimensionScore[] | null> {
	const rows = await db
		.select()
		.from(dimensionScoreCache)
		.where(
			and(
				eq(dimensionScoreCache.playerId, playerId),
				eq(dimensionScoreCache.dimensionType, dimType),
				eq(dimensionScoreCache.windowKey, windowKey),
			),
		);
	if (rows.length === 0) return null;
	return rows.map((r) => ({
		dimensionType: dimType,
		dimensionValue: r.dimensionValue,
		rawAccuracy: r.rawScore,
		adjustedAccuracy: r.adjustedScore,
		sampleSize: r.sampleSize,
		ratingEstimate: r.ratingEstimate ?? accuracyToRating(r.adjustedScore),
	}));
}

async function writeCachedBucket(
	playerId: string,
	windowKey: WindowKey,
	scores: DimensionScore[],
): Promise<void> {
	if (scores.length === 0) return;
	await db
		.insert(dimensionScoreCache)
		.values(
			scores.map((s) => ({
				playerId,
				dimensionType: s.dimensionType,
				dimensionValue: s.dimensionValue,
				windowKey,
				rawScore: s.rawAccuracy,
				adjustedScore: s.adjustedAccuracy,
				sampleSize: s.sampleSize,
				ratingEstimate: s.ratingEstimate,
			})),
		)
		.onConflictDoUpdate({
			target: [
				dimensionScoreCache.playerId,
				dimensionScoreCache.dimensionType,
				dimensionScoreCache.dimensionValue,
				dimensionScoreCache.windowKey,
			],
			set: {
				rawScore: sql`excluded.raw_score`,
				adjustedScore: sql`excluded.adjusted_score`,
				sampleSize: sql`excluded.sample_size`,
				ratingEstimate: sql`excluded.rating_estimate`,
				computedAt: sql`now()`,
			},
		});
}

// ── Orchestration ─────────────────────────────────────────────────────

async function computeBucket(
	playerId: string,
	dimType: DimensionType,
	windowKey: WindowKey,
): Promise<DimensionScore[]> {
	const gameIds = await getWindowGameIds(playerId, windowKey);
	const [prior, raws] = await Promise.all([
		getPlayerOverallAccuracy(playerId, gameIds),
		aggregateDimension(playerId, gameIds, dimType),
	]);
	const scores = raws.map((r) => scoreOne(dimType, r, prior));
	await writeCachedBucket(playerId, windowKey, scores);
	return scores;
}

async function getOrComputeBucket(
	playerId: string,
	dimType: DimensionType,
	windowKey: WindowKey,
): Promise<DimensionScore[]> {
	const cached = await readCachedBucket(playerId, dimType, windowKey);
	if (cached) return cached;
	return computeBucket(playerId, dimType, windowKey);
}

/**
 * Re-export of the cache invalidator for callers on the server-fn side.
 * The worker imports `invalidatePlayerCache` directly from `lib/scoring/cache`
 * since it owns its own Drizzle instance.
 */
export function invalidatePlayerCache(playerId: string): Promise<void> {
	return invalidatePlayerCacheImpl(db, playerId);
}

// ── Server functions ──────────────────────────────────────────────────

const dimTypeSchema = z.string().refine(isDimensionType, {
	message: "Unknown dimension type",
});

export const getDimensionScoresForPlayer = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			username: z.string().min(1),
			dimensionType: dimTypeSchema,
			windowKey: windowKeySchema.default(WINDOW_TRAILING_20),
		}),
	)
	.handler(async ({ data }) => {
		try {
			const [player] = await db
				.select({ id: players.id })
				.from(players)
				.where(eq(players.username, data.username.toLowerCase().trim()));
			if (!player) return { error: "Player not found" };
			const scores = await getOrComputeBucket(
				player.id,
				data.dimensionType as DimensionType,
				data.windowKey,
			);
			return { scores };
		} catch (err) {
			console.error("[getDimensionScoresForPlayer] Error:", err);
			return { error: "Failed to compute dimension scores" };
		}
	});

export const getDimensionScore = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			username: z.string().min(1),
			dimensionType: dimTypeSchema,
			dimensionValue: z.string().min(1),
			windowKey: windowKeySchema.default(WINDOW_TRAILING_20),
		}),
	)
	.handler(async ({ data }) => {
		try {
			const [player] = await db
				.select({ id: players.id })
				.from(players)
				.where(eq(players.username, data.username.toLowerCase().trim()));
			if (!player) return { error: "Player not found" };
			const bucket = await getOrComputeBucket(
				player.id,
				data.dimensionType as DimensionType,
				data.windowKey,
			);
			const score =
				bucket.find((s) => s.dimensionValue === data.dimensionValue) ?? null;
			return { score };
		} catch (err) {
			console.error("[getDimensionScore] Error:", err);
			return { error: "Failed to compute dimension score" };
		}
	});
