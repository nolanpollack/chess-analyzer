/**
 * Convert a centipawn evaluation to a win probability percentage (0–100).
 * Uses the same sigmoid Chess.com and Lichess use.
 * Positive cp = white advantage, negative = black advantage.
 */
export function cpToWinPct(cp: number): number {
	return 100 / (1 + Math.exp(-0.00368208 * cp));
}

export type MoveEvalData = {
	evalBefore: number;
	evalAfter: number;
	isWhite: boolean;
};

/**
 * Per-move accuracy (0–100) using the Lichess/Chess.com win-probability formula.
 * Computed from how much win% was lost on this single move, from the
 * mover's perspective.
 */
export function computeMoveAccuracy(data: MoveEvalData): number {
	const playerEvalBefore = data.isWhite ? data.evalBefore : -data.evalBefore;
	const playerEvalAfter = data.isWhite ? data.evalAfter : -data.evalAfter;
	const delta = Math.max(
		0,
		cpToWinPct(playerEvalBefore) - cpToWinPct(playerEvalAfter),
	);
	return Math.max(0, 103.1668 * Math.exp(-0.04354 * delta) - 3.1669);
}

/**
 * Compute the eval delta from a player's perspective.
 *
 * Evals are stored from white's perspective.
 * A negative eval_delta always means the player lost advantage.
 */
export function computeEvalDelta(
	evalBefore: number,
	evalAfter: number,
	isWhite: boolean,
): number {
	const rawDelta = evalAfter - evalBefore;
	return isWhite ? rawDelta : -rawDelta;
}
