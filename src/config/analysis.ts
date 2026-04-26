export const ANALYSIS_CONFIG = {
	/** Stockfish search depth per position. Override with ANALYSIS_ENGINE_DEPTH env var. */
	engineDepth: 12,

	/** Number of principal variations (lines) to compute */
	multiPv: 1,

	/** Move classification thresholds (win% lost from the mover's perspective, 0–100 scale). */
	classification: {
		// Standard waterfall: a move falls into the first bucket it fits.
		excellent: 2,
		good: 5,
		inaccuracy: 10,
		mistake: 20,
		// blunder: anything above `mistake`

		// Brilliant: near-best piece sacrifice, not already winning, doesn't land in a losing position.
		brilliantMaxWinLoss: 2,
		brilliantMaxWinPctBefore: 65,
		brilliantMinWinPctAfter: 45,

		// Great: critical turning point — position swings from not-winning to winning/equal.
		greatMaxWinPctBefore: 50,
		greatMinWinPctAfter: 55,
		greatMinWinGain: 10,

		// Miss: opponent just erred, player had a winning position and dropped it.
		missOpponentErrorMin: 10,
		missPlayerWinPctMin: 60,
		missPlayerDropMin: 10,
	},

	/** Maximum centipawn value to clamp eval display (avoids huge values for forced mates) */
	evalClamp: 1500,
} as const;
