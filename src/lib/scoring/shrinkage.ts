/**
 * Bayesian shrinkage toward a prior.
 *
 * For a noisy observed score from a small sample, blend it toward a stable
 * prior. The blend weight is `n / (n + k)`: with `n = 0` the result equals
 * the prior; as `n` grows the result approaches the raw observation.
 *
 * `k` is the "equivalent prior sample size" — larger `k` shrinks harder.
 *
 * This is the *only* place shrinkage logic lives. Importing it from anywhere
 * other than the scoring engine is a layering violation: the tag store,
 * generators, and cache must remain ignorant of shrinkage.
 */

export type ShrinkageInput = {
	/** Raw observed score (e.g. accuracy 0–100, or any unbounded scalar). */
	raw: number;
	/** Number of observations behind `raw`. */
	sampleSize: number;
	/** Stable prior to shrink toward (typically a player-wide aggregate). */
	prior: number;
	/** Equivalent prior sample size. Higher = more shrinkage. */
	k: number;
};

export function applyShrinkage({
	raw,
	sampleSize,
	prior,
	k,
}: ShrinkageInput): number {
	if (k < 0) throw new Error("shrinkage k must be >= 0");
	if (sampleSize < 0) throw new Error("sampleSize must be >= 0");
	const n = sampleSize;
	if (n === 0 && k === 0) return prior;
	return (n * raw + k * prior) / (n + k);
}
