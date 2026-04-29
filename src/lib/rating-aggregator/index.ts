import { DEFAULT_EPSILON } from "./epsilon";
import {
	aggregateLogLikelihoods,
	computePositionLogLikelihoods,
	computePosterior,
} from "./posterior";
import {
	computeCI,
	computePerPositionRatings,
	computePointEstimate,
} from "./summary";
import type { EstimatorOptions, Position, RatingEstimate } from "./types";

export type { EstimatorOptions, Position, RatingEstimate };

function resolveRatingGrid(
	positions: Position[],
	override?: number[],
): number[] {
	const grid = override ?? positions[0]?.maia.ratingGrid ?? [];
	for (const pos of positions) {
		if (!arraysEqual(pos.maia.ratingGrid, grid)) {
			throw new Error(
				`Mismatched rating grids across positions; got ${JSON.stringify(pos.maia.ratingGrid)} expected ${JSON.stringify(grid)}`,
			);
		}
	}
	return grid;
}

function arraysEqual(a: number[], b: number[]): boolean {
	if (a.length !== b.length) return false;
	return a.every((v, i) => v === b[i]);
}

function resolveWeights(positions: Position[], weights?: number[]): number[] {
	if (weights === undefined) return new Array<number>(positions.length).fill(1);
	if (weights.length !== positions.length) {
		throw new Error(
			`weights.length (${weights.length}) must match positions.length (${positions.length})`,
		);
	}
	return weights;
}

function resolveLogPrior(
	prior: number[] | undefined,
	nRatings: number,
): number[] {
	if (prior === undefined) {
		// Uniform: log(1/n) for each bucket — constant, won't affect normalization
		const logUniform = Math.log(1 / nRatings);
		return new Array<number>(nRatings).fill(logUniform);
	}
	if (prior.length !== nRatings) {
		throw new Error(
			`prior.length (${prior.length}) must match ratingGrid.length (${nRatings})`,
		);
	}
	return prior.map((p) => Math.log(Math.max(p, Number.EPSILON)));
}

/**
 * Estimates a player's rating from a set of positions with Maia outputs and
 * the moves the player actually played.
 *
 * Returns a full posterior distribution, point estimate, CI, and per-position
 * diagnostics.
 */
export function estimateRating(
	positions: Position[],
	opts?: EstimatorOptions,
): RatingEstimate {
	if (positions.length === 0) {
		throw new Error("estimateRating requires at least one position");
	}

	const epsilon = opts?.epsilon ?? DEFAULT_EPSILON;
	const ratingGrid = resolveRatingGrid(positions, opts?.ratingGrid);
	const weights = resolveWeights(positions, opts?.weights);
	const logPrior = resolveLogPrior(opts?.prior, ratingGrid.length);

	const logLikelihoodPerPosition = positions.map((pos) =>
		computePositionLogLikelihoods(pos.maia, pos.playedMove, epsilon),
	);

	const aggregatedLogLikelihood = aggregateLogLikelihoods(
		logLikelihoodPerPosition,
		weights,
	);

	const posterior = computePosterior(aggregatedLogLikelihood, logPrior);
	const pointEstimate = computePointEstimate(posterior, ratingGrid);
	const { ciLow, ciHigh } = computeCI(posterior, ratingGrid);
	const perPositionRatings = computePerPositionRatings(
		logLikelihoodPerPosition,
		ratingGrid,
	);

	return {
		posterior,
		ratingGrid,
		pointEstimate,
		ciLow,
		ciHigh,
		nPositions: positions.length,
		logLikelihoodPerPosition,
		perPositionRatings,
	};
}
