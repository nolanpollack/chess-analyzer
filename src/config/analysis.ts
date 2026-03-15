export const ANALYSIS_CONFIG = {
	/** Stockfish search depth per position. Override with ANALYSIS_ENGINE_DEPTH env var. */
	engineDepth: 12,

	/** Number of principal variations (lines) to compute */
	multiPv: 1,

	/**
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
