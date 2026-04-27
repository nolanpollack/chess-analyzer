/**
 * Phase 2: per-game multivariate feature extraction.
 *
 * Extracts features for one player's perspective in a single game.
 * These features are the inputs to the multivariate OLS regression model.
 *
 * Design notes:
 * - Complexity is used as a PARTITION (hard vs easy moves), not as a weight.
 *   Phase 1 showed complexity-weighting *reduced* correlation. Partitioning
 *   captures the insight that accuracy on hard positions is more diagnostic.
 * - HIGH_COMPLEXITY_THRESHOLD = 5.0 (global constant, matches dataset mean).
 *   Per-game median would be unstable; a fixed global threshold is reproducible.
 * - Clock features: derived from clockMs delta. If any move in the color's
 *   slice has null clockMs, all time features return null for that game.
 */

/** Global threshold for classifying a move as "high complexity". */
export const HIGH_COMPLEXITY_THRESHOLD = 5.0;

/** Accuracy below this is treated as a blunder for blunderRate. */
const BLUNDER_ACCURACY_THRESHOLD = 50;

/** Accuracy in [50, 80) is treated as an inaccuracy for inaccuracyRate. */
const INACCURACY_ACCURACY_MAX = 80;

/** Remaining clock time below which a move is "under time pressure" (ms). */
const TIME_PRESSURE_THRESHOLD_MS = 30_000;

type CachedMove = {
	ply: number;
	isWhite: boolean;
	san: string;
	uci: string;
	fenBefore: string;
	fenAfter: string;
	evalBeforeCp: number;
	evalAfterCp: number;
	pv2BeforeCp: number | null;
	bestMoveUci: string;
	bestMoveSan: string;
	complexity: number;
	accuracy: number;
	clockMs: number | null;
};

type CachedGame = {
	gameId: string;
	whiteElo: number;
	blackElo: number;
	timeControl: string;
	timeControlClass: string;
	result: string;
	moves: CachedMove[];
};

export type GameFeatures = {
	// Strongest single signal — kept as feature (not replaced)
	lichessAccuracy: number;

	// Complexity as partition (NOT as weighting)
	accuracyOnHighComplexity: number;
	accuracyOnLowComplexity: number;
	highComplexityCount: number;
	lowComplexityCount: number;

	// Move-quality distribution
	blunderRate: number;
	inaccuracyRate: number;
	meanCpl: number;

	// Time pressure (null if clockMs unavailable on any move)
	meanTimeSpentMs: number | null;
	meanTimeFractionUsed: number | null;
	blunderRateUnderPressure: number | null;

	// Game shape
	moveCount: number;
	opponentRating: number;
	timeControlClass: string;
};

/** Parse increment in ms from a "base+inc" time control string (e.g. "600+5"). */
function parseIncrementMs(timeControl: string): number {
	const match = timeControl.match(/^\d+\+(\d+)$/);
	return match ? Number(match[1]) * 1000 : 0;
}

/** Compute per-move time spent given consecutive clock readings and increment. */
function computeTimeSpentMs(
	clockBefore: number,
	clockAfter: number,
	incrementMs: number,
): number {
	// clock_after = clock_before - time_spent + increment
	// → time_spent = clock_before - clock_after + increment
	return Math.max(0, clockBefore - clockAfter + incrementMs);
}

type AccuracyPartition = {
	highAccuracySum: number;
	highCount: number;
	lowAccuracySum: number;
	lowCount: number;
};

function partitionByComplexity(moves: CachedMove[]): AccuracyPartition {
	let highAccuracySum = 0;
	let highCount = 0;
	let lowAccuracySum = 0;
	let lowCount = 0;

	for (const move of moves) {
		if (move.complexity >= HIGH_COMPLEXITY_THRESHOLD) {
			highAccuracySum += move.accuracy;
			highCount++;
		} else {
			lowAccuracySum += move.accuracy;
			lowCount++;
		}
	}

	return { highAccuracySum, highCount, lowAccuracySum, lowCount };
}

function computeComplexityPartitionFeatures(partition: AccuracyPartition): {
	accuracyOnHighComplexity: number;
	accuracyOnLowComplexity: number;
	highComplexityCount: number;
	lowComplexityCount: number;
} {
	const lowAcc =
		partition.lowCount > 0 ? partition.lowAccuracySum / partition.lowCount : 0;
	const highAcc =
		partition.highCount > 0
			? partition.highAccuracySum / partition.highCount
			: lowAcc; // fallback: no hard moves → use easy accuracy

	return {
		accuracyOnHighComplexity: highAcc,
		accuracyOnLowComplexity: lowAcc,
		highComplexityCount: partition.highCount,
		lowComplexityCount: partition.lowCount,
	};
}

type MoveQualityDistribution = {
	blunderRate: number;
	inaccuracyRate: number;
	meanCpl: number;
};

function computeMoveQuality(
	moves: CachedMove[],
	isWhitePerspective: boolean,
): MoveQualityDistribution {
	if (moves.length === 0) {
		return { blunderRate: 0, inaccuracyRate: 0, meanCpl: 0 };
	}

	let blunderCount = 0;
	let inaccuracyCount = 0;
	let totalCpl = 0;

	for (const move of moves) {
		if (move.accuracy < BLUNDER_ACCURACY_THRESHOLD) blunderCount++;
		else if (move.accuracy < INACCURACY_ACCURACY_MAX) inaccuracyCount++;

		// CPL = eval loss from the player's perspective in centipawns
		const evalBefore = isWhitePerspective
			? move.evalBeforeCp
			: -move.evalBeforeCp;
		const evalAfter = isWhitePerspective ? move.evalAfterCp : -move.evalAfterCp;
		const cpl = Math.max(0, evalBefore - evalAfter);
		totalCpl += cpl;
	}

	return {
		blunderRate: blunderCount / moves.length,
		inaccuracyRate: inaccuracyCount / moves.length,
		meanCpl: totalCpl / moves.length,
	};
}

type TimeFeatures = {
	meanTimeSpentMs: number;
	meanTimeFractionUsed: number;
	blunderRateUnderPressure: number;
} | null;

function computeTimeFeatures(
	colorMoves: CachedMove[],
	allMoves: CachedMove[],
	incrementMs: number,
): TimeFeatures {
	// Need clock data on all moves to compute time spent per move
	const hasAllClocks = allMoves.every((m) => m.clockMs !== null);
	if (!hasAllClocks || colorMoves.length === 0) return null;

	let totalTimeSpentMs = 0;
	let totalTimeFractionUsed = 0;
	let pressureBlunders = 0;
	let pressureMoves = 0;

	for (let i = 0; i < colorMoves.length; i++) {
		const move = colorMoves[i];
		const moveIdx = move.ply - 1; // ply is 1-indexed

		// Clock before this move = clock reading of the same color's previous move
		// (2 plies earlier), or starting clock if first move.
		const prevSameColorIdx = moveIdx - 2;
		const clockBefore =
			prevSameColorIdx >= 0 && allMoves[prevSameColorIdx]
				? allMoves[prevSameColorIdx].clockMs!
				: // First move of this color: clock reading is before any move
					// Lichess stores clock AFTER the move, so the first clock reading
					// for white (ply=1) is the clock after white's first move.
					// We approximate starting clock from the time control.
					move.clockMs! + (incrementMs > 0 ? -incrementMs : 0);

		const timeSpent = computeTimeSpentMs(
			clockBefore,
			move.clockMs!,
			incrementMs,
		);
		const clockAtStart = clockBefore;

		totalTimeSpentMs += timeSpent;
		if (clockAtStart > 0) {
			totalTimeFractionUsed += timeSpent / clockAtStart;
		}

		// Time pressure: remaining clock before the move
		if (clockAtStart < TIME_PRESSURE_THRESHOLD_MS) {
			pressureMoves++;
			if (move.accuracy < BLUNDER_ACCURACY_THRESHOLD) pressureBlunders++;
		}
	}

	return {
		meanTimeSpentMs: totalTimeSpentMs / colorMoves.length,
		meanTimeFractionUsed: totalTimeFractionUsed / colorMoves.length,
		blunderRateUnderPressure:
			pressureMoves > 0 ? pressureBlunders / pressureMoves : 0,
	};
}

/**
 * Extract all features for one player's perspective in a single game.
 * Returns null if the color has no moves.
 */
export function extractGameFeatures(
	game: CachedGame,
	color: "white" | "black",
): GameFeatures | null {
	const isWhite = color === "white";
	const colorMoves = game.moves.filter((m) => m.isWhite === isWhite);

	if (colorMoves.length === 0) return null;

	const opponentRating = isWhite ? game.blackElo : game.whiteElo;

	// Lichess accuracy: mean of per-move accuracy values in the cache
	// (already computed by build-eval-cache using the Lichess formula)
	const lichessAccuracy =
		colorMoves.reduce((s, m) => s + m.accuracy, 0) / colorMoves.length;

	const partition = partitionByComplexity(colorMoves);
	const complexityFeatures = computeComplexityPartitionFeatures(partition);
	const moveQuality = computeMoveQuality(colorMoves, isWhite);

	const incrementMs = parseIncrementMs(game.timeControl);
	const timeFeatures = computeTimeFeatures(colorMoves, game.moves, incrementMs);

	return {
		lichessAccuracy,
		...complexityFeatures,
		...moveQuality,
		meanTimeSpentMs: timeFeatures?.meanTimeSpentMs ?? null,
		meanTimeFractionUsed: timeFeatures?.meanTimeFractionUsed ?? null,
		blunderRateUnderPressure: timeFeatures?.blunderRateUnderPressure ?? null,
		moveCount: colorMoves.length,
		opponentRating,
		timeControlClass: game.timeControlClass,
	};
}
