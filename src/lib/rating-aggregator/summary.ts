/**
 * Computes the posterior mean (point estimate) from a posterior distribution
 * over a rating grid.
 */
export function computePointEstimate(
	posterior: number[],
	ratingGrid: number[],
): number {
	return posterior.reduce((acc, p, r) => acc + p * (ratingGrid[r] ?? 0), 0);
}

/**
 * Computes a confidence interval percentile via linear interpolation across
 * the posterior CDF. Returns the interpolated rating at the given quantile.
 */
function interpolateQuantile(
	posterior: number[],
	ratingGrid: number[],
	quantile: number,
): number {
	let cumulative = 0;
	for (let r = 0; r < posterior.length; r++) {
		const prev = cumulative;
		cumulative += posterior[r] ?? 0;
		if (cumulative >= quantile) {
			// Linearly interpolate within this bucket
			const pBucket = posterior[r] ?? 0;
			if (pBucket === 0) return ratingGrid[r] ?? 0;
			const fraction = (quantile - prev) / pBucket;
			const rLow = ratingGrid[r] ?? 0;
			const rHigh = ratingGrid[r + 1] ?? rLow;
			return rLow + fraction * (rHigh - rLow);
		}
	}
	return ratingGrid[ratingGrid.length - 1] ?? 0;
}

/**
 * Computes 5th and 95th percentile confidence interval from the posterior.
 */
export function computeCI(
	posterior: number[],
	ratingGrid: number[],
): { ciLow: number; ciHigh: number } {
	return {
		ciLow: interpolateQuantile(posterior, ratingGrid, 0.05),
		ciHigh: interpolateQuantile(posterior, ratingGrid, 0.95),
	};
}

/**
 * Finds the rating bucket with peak log-likelihood for each position.
 * Returns an array of length nPositions.
 */
export function computePerPositionRatings(
	logLikelihoodPerPosition: number[][],
	ratingGrid: number[],
): number[] {
	return logLikelihoodPerPosition.map((row) => {
		let maxVal = -Infinity;
		let maxIdx = 0;
		for (let r = 0; r < row.length; r++) {
			if ((row[r] ?? -Infinity) > maxVal) {
				maxVal = row[r] ?? -Infinity;
				maxIdx = r;
			}
		}
		return ratingGrid[maxIdx] ?? 0;
	});
}
