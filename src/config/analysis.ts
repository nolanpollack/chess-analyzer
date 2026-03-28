export const ANALYSIS_CONFIG = {
	/** Stockfish search depth per position. Override with ANALYSIS_ENGINE_DEPTH env var. */
	engineDepth: 12,

	/** Number of principal variations (lines) to compute */
	multiPv: 1,

	/**
	 * These are flat centipawn thresholds. A future improvement is to convert engine evals to win probability using a rating-adjusted model (similar to chess.com's Expected Points Model), which would make classification thresholds feel more appropriate across different rating levels. For now, flat thresholds work for MVP.
	 * Move classification thresholds (centipawn loss from player's perspective).
	 * A move is classified by the worst threshold it exceeds.
	 */
	classification: {
		blunder: 200,
		mistake: 100,
		inaccuracy: 50,
	},

	/** Maximum centipawn value to clamp eval display (avoids huge values for forced mates) */
	evalClamp: 1500,
} as const;
