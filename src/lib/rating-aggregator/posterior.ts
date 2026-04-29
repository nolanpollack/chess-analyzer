import type { MaiaOutput } from "#/lib/position-cache/types";
import { applyEpsilon } from "./epsilon";

/**
 * Looks up the played move probability from the Maia output for a single
 * rating bucket r. Returns 0 if the move is not in moveIndex.
 */
function getPlayedMoveProbability(
	maia: MaiaOutput,
	playedMove: string,
	ratingIndex: number,
): number {
	const moveIdx = maia.moveIndex.indexOf(playedMove);
	if (moveIdx === -1) return 0;
	return maia.probabilities[ratingIndex * maia.moveIndex.length + moveIdx] ?? 0;
}

/**
 * Computes per-position log-likelihoods for one position across all rating
 * buckets, after applying ε-flooring.
 * Returns an array of length ratingGrid.length.
 */
export function computePositionLogLikelihoods(
	maia: MaiaOutput,
	playedMove: string,
	epsilon: number,
): number[] {
	return maia.ratingGrid.map((_, ratingIndex) => {
		const prob = getPlayedMoveProbability(maia, playedMove, ratingIndex);
		const floored = applyEpsilon(prob, epsilon);
		return Math.log(floored);
	});
}

/**
 * Aggregates weighted log-likelihoods across all positions into a single
 * log-likelihood vector of length ratingGrid.length.
 */
export function aggregateLogLikelihoods(
	logLikelihoodPerPosition: number[][],
	weights: number[],
): number[] {
	const nRatings = logLikelihoodPerPosition[0]?.length ?? 0;
	const aggregated = new Array<number>(nRatings).fill(0);

	for (let i = 0; i < logLikelihoodPerPosition.length; i++) {
		const row = logLikelihoodPerPosition[i];
		const w = weights[i] ?? 1.0;
		for (let r = 0; r < nRatings; r++) {
			aggregated[r] += w * (row?.[r] ?? 0);
		}
	}

	return aggregated;
}

/**
 * Combines aggregated log-likelihood with log-prior and normalizes via
 * log-sum-exp to produce a proper posterior probability distribution.
 */
export function computePosterior(
	logLikelihood: number[],
	logPrior: number[],
): number[] {
	const logUnnorm = logLikelihood.map((ll, r) => ll + (logPrior[r] ?? 0));

	const maxLog = Math.max(...logUnnorm);
	const unnorm = logUnnorm.map((v) => Math.exp(v - maxLog));
	const sum = unnorm.reduce((a, b) => a + b, 0);

	return unnorm.map((v) => v / sum);
}
