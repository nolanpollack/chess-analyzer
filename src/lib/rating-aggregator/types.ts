import type { MaiaOutput } from "#/lib/position-cache/types";

export type Position = {
	fen: string;
	/** UCI string of the move actually played in this position. */
	playedMove: string;
	maia: MaiaOutput;
	/**
	 * Source-game date for this position. Optional. When provided AND the
	 * estimator is given `now` + `tauDays`, an exp(-age/tau) recency factor
	 * is multiplied into this position's weight.
	 */
	playedAt?: Date;
};

export type EstimatorOptions = {
	/** Probability floor; default 1e-6. Applied per-position before log. */
	epsilon?: number;
	/** Per-position weights; default 1.0 each. Length must match positions. */
	weights?: number[];
	/**
	 * Prior over the rating grid (same length as MaiaOutput.ratingGrid).
	 * Probabilities, not log-probs. Default: uniform.
	 */
	prior?: number[];
	/**
	 * Override rating grid. If omitted, uses the grid from the first position.
	 * If any position's grid differs, throws a clear error.
	 */
	ratingGrid?: number[];
	/**
	 * Reference time for per-position recency decay. Required to enable recency
	 * weighting; combined with `tauDays` and each Position's `playedAt`.
	 */
	now?: Date;
	/** Recency time constant in days. Required to enable recency weighting. */
	tauDays?: number;
};

export type RatingEstimate = {
	/** Probability over rating grid. Sums to 1. */
	posterior: number[];
	/** Aligned with posterior. */
	ratingGrid: number[];
	/** Posterior mean. */
	pointEstimate: number;
	/** 5th and 95th percentiles of the posterior (linear interpolation). */
	ciLow: number;
	ciHigh: number;
	nPositions: number;
	/**
	 * Per-position log P(played | fen, r) AFTER ε-flooring,
	 * shape (nPositions, ratingGrid.length).
	 */
	logLikelihoodPerPosition: number[][];
	/**
	 * Rating bucket at peak likelihood for each position.
	 * Length nPositions.
	 */
	perPositionRatings: number[];
};
