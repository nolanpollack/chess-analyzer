/**
 * Pure orchestration helper: given a tag-slice query, fetches tagged positions
 * from the DB, batches Maia lookup in a single round-trip, and runs the
 * Bayesian aggregator per dimension value.
 *
 * No createServerFn here — plain function so eval scripts and worker code
 * can also call it without pulling in the TanStack Start runtime.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { games, moves, moveTags } from "#/db/schema";
import type { MaiaOutput, PositionCache } from "#/lib/position-cache";
import type { Db } from "#/lib/position-cache/types";
import type { Position } from "#/lib/rating-aggregator";
import { estimateRating } from "#/lib/rating-aggregator";
import {
	buildGaussianPrior,
	PRODUCTION_MAIA_EPSILON,
	PRODUCTION_MAIA_PRIOR,
	PRODUCTION_MAIA_VERSIONS,
} from "./maia-game-rating";

// ── Types ──────────────────────────────────────────────────────────────

export type TagSliceQuery = {
	playerId: string;
	dimensionType: string;
	dimensionValue?: string;
	windowKey?: string; // default: "trailing_20"
	/** When set, restricts the query to a single game instead of using the window. */
	gameId?: string;
};

export type MaiaTagRating = {
	dimensionValue: string;
	predicted: number;
	ciLow: number;
	ciHigh: number;
	nPositions: number;
};

type TaggedPosition = {
	fen: string;
	uci: string;
	dimensionValue: string;
	playedAt: Date;
};

/** Same default tau as the per-game recency aggregator. Keep in sync. */
const TAU_DAYS = 60;

// ── Window helper ──────────────────────────────────────────────────────

const WINDOW_GAME_COUNT = 20;

async function getWindowGameIds(db: Db, playerId: string): Promise<string[]> {
	const rows = await db
		.select({ id: games.id })
		.from(games)
		.where(eq(games.playerId, playerId))
		.orderBy(desc(games.playedAt))
		.limit(WINDOW_GAME_COUNT);
	return rows.map((r) => r.id);
}

// ── SQL layer ──────────────────────────────────────────────────────────

async function fetchTaggedPositions(
	db: Db,
	playerId: string,
	gameIds: string[],
	dimensionType: string,
	dimensionValue: string | undefined,
): Promise<TaggedPosition[]> {
	if (gameIds.length === 0) return [];

	const conditions = [
		eq(moveTags.playerId, playerId),
		eq(moveTags.dimensionType, dimensionType),
		inArray(moveTags.gameId, gameIds),
		eq(moves.isPlayerMove, 1),
	];
	if (dimensionValue !== undefined) {
		conditions.push(eq(moveTags.dimensionValue, dimensionValue));
	}

	const rows = await db
		.select({
			fen: moves.fenBefore,
			uci: moves.uci,
			dimensionValue: moveTags.dimensionValue,
			playedAt: games.playedAt,
		})
		.from(moveTags)
		.innerJoin(moves, eq(moves.id, moveTags.moveId))
		.innerJoin(games, eq(games.id, moveTags.gameId))
		.where(and(...conditions));

	return rows;
}

// ── Aggregator layer ───────────────────────────────────────────────────

type GroupPosition = { fen: string; uci: string; playedAt: Date };

function groupByDimensionValue(
	tagged: TaggedPosition[],
): Map<string, GroupPosition[]> {
	const groups = new Map<string, GroupPosition[]>();
	for (const { fen, uci, dimensionValue, playedAt } of tagged) {
		const list = groups.get(dimensionValue) ?? [];
		list.push({ fen, uci, playedAt });
		groups.set(dimensionValue, list);
	}
	return groups;
}

function rateGroup(
	positions: GroupPosition[],
	maiaMap: Map<string, MaiaOutput>,
	now: Date,
): MaiaTagRating | null {
	const ratingPositions: Position[] = [];
	for (const { fen, uci, playedAt } of positions) {
		const maia = maiaMap.get(fen);
		if (!maia) {
			console.warn(`[maia-tag-rating] cache miss for fen=${fen.slice(0, 20)}`);
			continue;
		}
		ratingPositions.push({ fen, playedMove: uci, maia, playedAt });
	}
	if (ratingPositions.length === 0) return null;

	const ratingGrid = ratingPositions[0].maia.ratingGrid;
	const prior = buildGaussianPrior(
		ratingGrid,
		PRODUCTION_MAIA_PRIOR.gaussian.mean,
		PRODUCTION_MAIA_PRIOR.gaussian.std,
	);

	const estimate = estimateRating(ratingPositions, {
		epsilon: PRODUCTION_MAIA_EPSILON,
		prior,
		now,
		tauDays: TAU_DAYS,
	});

	// dimensionValue filled by caller
	return {
		dimensionValue: "",
		predicted: estimate.pointEstimate,
		ciLow: estimate.ciLow,
		ciHigh: estimate.ciHigh,
		nPositions: estimate.nPositions,
	};
}

// ── Public entry point ─────────────────────────────────────────────────

/**
 * Computes Maia-based ratings for each dimension value in a tag slice.
 * All Maia lookups are batched into a single DB call.
 */
export async function computeMaiaTagRatings(
	db: Db,
	cache: PositionCache,
	query: TagSliceQuery,
): Promise<MaiaTagRating[]> {
	// When gameId is supplied, score only that game (game-detail view).
	// Otherwise, use the trailing-window of recent games.
	const gameIds = query.gameId
		? [query.gameId]
		: await getWindowGameIds(db, query.playerId);
	if (gameIds.length === 0) return [];

	const tagged = await fetchTaggedPositions(
		db,
		query.playerId,
		gameIds,
		query.dimensionType,
		query.dimensionValue,
	);
	if (tagged.length === 0) return [];

	const groups = groupByDimensionValue(tagged);

	// Single batched Maia lookup across ALL dimension values
	const allFens = [...new Set(tagged.map((t) => t.fen))];
	const maiaMap = await cache.getMaiaBatch(
		allFens,
		PRODUCTION_MAIA_VERSIONS.maiaVersion,
	);

	const now = new Date();
	const results: MaiaTagRating[] = [];
	for (const [dimValue, positions] of groups) {
		const rating = rateGroup(positions, maiaMap, now);
		if (rating !== null) {
			results.push({ ...rating, dimensionValue: dimValue });
		}
	}
	return results;
}
