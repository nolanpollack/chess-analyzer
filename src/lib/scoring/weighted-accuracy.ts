/**
 * Complexity-weighted accuracy aggregator.
 *
 * This is the single source of truth for both game-level and
 * dimension-slice accuracy aggregation (per ratings.md).
 *
 * Formula: weighted harmonic mean
 *   H = sum(w_i) / sum(w_i / a_i)
 * where w_i = max(complexity_i, EPSILON).
 *
 * EPSILON ensures trivial positions (complexity=0) still count a tiny bit.
 * With uniform complexity all weights are equal and the result reduces to
 * the plain harmonic mean of per-move accuracies.
 */

/** Floor weight so that zero-complexity moves still count. */
const EPSILON = 1.0;

export type WeightedMove = {
	/** Per-move accuracy 0–100, lichess formula. */
	accuracy: number;
	/** Position complexity 0–50, from moveComplexity(). */
	complexity: number;
	/** True if it was white's turn. */
	isWhite: boolean;
};

/** Per-color accuracy aggregate — drop-in shape for computeGameAccuracy result. */
export type WeightedAccuracy = { white: number; black: number };

/**
 * Weighted harmonic mean over an array of (accuracy, weight) pairs.
 * Returns null when the array is empty or all accuracies are zero.
 */
function weightedHarmonicMean(
	pairs: Array<{ accuracy: number; weight: number }>,
): number | null {
	if (pairs.length === 0) return null;
	let sumW = 0;
	let sumWoverA = 0;
	for (const { accuracy, weight } of pairs) {
		sumW += weight;
		// Avoid division by zero; treat 0-accuracy as a tiny floor
		sumWoverA += accuracy > 0 ? weight / accuracy : weight / 0.001;
	}
	if (sumWoverA === 0) return null;
	return sumW / sumWoverA;
}

/**
 * Compute complexity-weighted accuracy for white and black from the full
 * ordered move sequence (all plies interleaved, not split by color).
 *
 * Drop-in replacement for computeGameAccuracy — same return shape.
 * Returns null when there are no moves.
 */
export function computeWeightedAccuracy(
	moves: WeightedMove[],
): WeightedAccuracy | null {
	if (moves.length === 0) return null;

	const whitePairs: Array<{ accuracy: number; weight: number }> = [];
	const blackPairs: Array<{ accuracy: number; weight: number }> = [];

	for (const move of moves) {
		const weight = Math.max(move.complexity, EPSILON);
		const pair = { accuracy: move.accuracy, weight };
		if (move.isWhite) {
			whitePairs.push(pair);
		} else {
			blackPairs.push(pair);
		}
	}

	const white = weightedHarmonicMean(whitePairs);
	const black = weightedHarmonicMean(blackPairs);
	if (white === null || black === null) return null;

	return {
		white: Math.round(white * 10) / 10,
		black: Math.round(black * 10) / 10,
	};
}

/**
 * Compute complexity-weighted accuracy for an arbitrary move slice (not split
 * by color). Used by the dimension ratings scoring engine to aggregate accuracy
 * within a tagged dimension bucket.
 *
 * Returns null when moves is empty.
 */
export function computeWeightedAccuracySlice(
	moves: WeightedMove[],
): number | null {
	if (moves.length === 0) return null;

	const pairs = moves.map((m) => ({
		accuracy: m.accuracy,
		weight: Math.max(m.complexity, EPSILON),
	}));

	const result = weightedHarmonicMean(pairs);
	if (result === null) return null;
	return Math.round(result * 10) / 10;
}
