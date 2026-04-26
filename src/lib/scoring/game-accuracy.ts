/**
 * Game-level accuracy using the Lichess formula.
 *
 * Mirrors AccuracyPercent.gameAccuracy in lichess-org/lila:
 * a mean of volatility-weighted mean and harmonic mean of per-move accuracies.
 *
 * Reference:
 * https://github.com/lichess-org/lila/blob/2e653ad1e2b9fad31b4a092394019ef8fafdedb8/modules/analyse/src/main/AccuracyPercent.scala#L81-L112
 */
import { cpToWinPct, type MoveEvalData } from "#/lib/analysis/accuracy";

function standardDeviation(values: number[]): number {
	if (values.length < 2) return 0;
	const mean = values.reduce((a, b) => a + b, 0) / values.length;
	const variance =
		values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
	return Math.sqrt(variance);
}

function weightedMean(
	pairs: Array<[value: number, weight: number]>,
): number | null {
	if (pairs.length === 0) return null;
	const totalWeight = pairs.reduce((sum, [, w]) => sum + w, 0);
	if (totalWeight === 0) return null;
	return pairs.reduce((sum, [v, w]) => sum + v * w, 0) / totalWeight;
}

function harmonicMean(values: number[]): number | null {
	if (values.length === 0) return null;
	const reciprocalSum = values.reduce((sum, v) => sum + (v > 0 ? 1 / v : 0), 0);
	if (reciprocalSum === 0) return null;
	return values.length / reciprocalSum;
}

function moveAccuracyFromWinPct(
	winPctBefore: number,
	winPctAfter: number,
): number {
	const delta = Math.max(0, winPctBefore - winPctAfter);
	return Math.max(0, 103.1668 * Math.exp(-0.04354 * delta) - 3.1669);
}

export type GameAccuracy = {
	white: number;
	black: number;
};

/**
 * Compute game accuracy for both colors from the full ordered move sequence.
 *
 * Requires all moves interleaved in game order (not split by color) so the
 * sliding volatility windows reflect the actual flow of the game.
 *
 * Returns null if there are no moves.
 */
export function computeGameAccuracy(
	moves: MoveEvalData[],
): GameAccuracy | null {
	if (moves.length === 0) return null;

	// Win percentages from white's perspective for every position in the game.
	// N moves → N+1 positions (before move 0 … after move N-1).
	const allWinPcts = [
		cpToWinPct(moves[0].evalBefore),
		...moves.map((m) => cpToWinPct(m.evalAfter)),
	];

	// Window size: floor(N / 10), clamped to [2, 8]
	const windowSize = Math.max(2, Math.min(8, Math.floor(moves.length / 10)));

	// Build one window per move (= N windows total).
	// Prefix: (min(windowSize, N+1) - 2) copies of the first window.
	// Suffix: all sliding windows of size `windowSize`.
	// This matches Lichess's List.fill(...) ::: sliding(...) construction.
	const firstWindow = allWinPcts.slice(0, windowSize);
	const prefixCount = Math.max(0, Math.min(windowSize, allWinPcts.length) - 2);
	const windows: number[][] = Array.from(
		{ length: prefixCount },
		() => firstWindow,
	);
	for (let i = 0; i <= allWinPcts.length - windowSize; i++) {
		windows.push(allWinPcts.slice(i, i + windowSize));
	}

	// Weight per move = standard deviation of its window, clamped to [0.5, 12].
	// Higher volatility (sharper swings) = higher weight.
	const weights = windows.map((w) =>
		Math.max(0.5, Math.min(12, standardDeviation(w))),
	);

	const whiteAccuracies: Array<[value: number, weight: number]> = [];
	const blackAccuracies: Array<[value: number, weight: number]> = [];

	for (let i = 0; i < moves.length; i++) {
		const prev = allWinPcts[i];
		const next = allWinPcts[i + 1];
		const weight = weights[i];
		const { isWhite } = moves[i];

		// Convert to mover's perspective before computing accuracy.
		// For black: inverting win% (100 - x) is equivalent to Lichess's
		// color.fold(next, prev) trick, since the delta is the same.
		const winPctBefore = isWhite ? prev : 100 - prev;
		const winPctAfter = isWhite ? next : 100 - next;
		const accuracy = moveAccuracyFromWinPct(winPctBefore, winPctAfter);

		if (isWhite) {
			whiteAccuracies.push([accuracy, weight]);
		} else {
			blackAccuracies.push([accuracy, weight]);
		}
	}

	const colorAccuracy = (
		accuracies: Array<[value: number, weight: number]>,
	): number | null => {
		const wm = weightedMean(accuracies);
		const hm = harmonicMean(accuracies.map(([v]) => v));
		if (wm === null || hm === null) return null;
		return (wm + hm) / 2;
	};

	const white = colorAccuracy(whiteAccuracies);
	const black = colorAccuracy(blackAccuracies);
	if (white === null || black === null) return null;

	return {
		white: Math.round(white * 10) / 10,
		black: Math.round(black * 10) / 10,
	};
}
