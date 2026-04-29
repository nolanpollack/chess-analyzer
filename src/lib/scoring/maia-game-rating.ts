/**
 * Pure scoring helper: given per-side (fen, playedMove) lists and a
 * pre-fetched Maia cache map, runs Bayesian rating estimation and
 * returns the result.
 *
 * No DB, no HTTP — all I/O is the caller's responsibility.
 */
import type { MaiaOutput } from "#/lib/position-cache";
import type { Position } from "#/lib/rating-aggregator";
import { estimateRating } from "#/lib/rating-aggregator";

export type GameSidePositions = {
	side: "white" | "black";
	positions: { fen: string; playedMove: string }[];
};

export type MaiaGameRatingResult = {
	side: "white" | "black";
	predicted: number;
	ciLow: number;
	ciHigh: number;
	nPositions: number;
};

/** Locked production prior — G(1500, 400). */
export const PRODUCTION_MAIA_PRIOR = { gaussian: { mean: 1500, std: 400 } };

/** Locked production versions for Phase 7. */
export const PRODUCTION_MAIA_VERSIONS = {
	maiaVersion: "maia2-rapid-v1.0",
	stockfishVersion: "sf18",
	stockfishDepth: 18,
};

/** Probability floor (ε) used for all production rating calls. */
export const PRODUCTION_MAIA_EPSILON = 1e-6;

function gaussianPdf(x: number, mean: number, std: number): number {
	const z = (x - mean) / std;
	return Math.exp(-0.5 * z * z) / (std * Math.sqrt(2 * Math.PI));
}

function buildGaussianPrior(
	ratingGrid: number[],
	mean: number,
	std: number,
): number[] {
	const raw = ratingGrid.map((r) => gaussianPdf(r, mean, std));
	const sum = raw.reduce((a, b) => a + b, 0);
	return raw.map((v) => v / sum);
}

/**
 * Pure: assembles Position objects from a cache map, runs estimateRating,
 * and returns the result. Returns null if no positions have cached Maia data.
 */
export function estimateGameSideRating(
	side: "white" | "black",
	positions: { fen: string; playedMove: string }[],
	maiaMap: Map<string, MaiaOutput>,
): MaiaGameRatingResult | null {
	if (positions.length === 0) return null;

	const ratingPositions: Position[] = [];
	for (const { fen, playedMove } of positions) {
		const maia = maiaMap.get(fen);
		if (!maia) continue;
		ratingPositions.push({ fen, playedMove, maia });
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
	});

	return {
		side,
		predicted: estimate.pointEstimate,
		ciLow: estimate.ciLow,
		ciHigh: estimate.ciHigh,
		nPositions: estimate.nPositions,
	};
}
