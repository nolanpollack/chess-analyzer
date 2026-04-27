/**
 * Per-move position complexity.
 *
 * Complexity is the win-percentage gap between the engine's best move (PV1)
 * and the second-best move (PV2) from the side-to-move's perspective.
 *
 * A large gap means only one move is good — the position demanded precision.
 * A small gap means many moves are roughly equal — the position is "easy".
 *
 * Both input evals are from Stockfish's side-to-move perspective (already
 * signed correctly), so no color flip is needed here.
 *
 * Reference: Regan "intrinsic chess ratings" + Big Data Cup 2024.
 */

import { cpToWinPct } from "#/lib/analysis/accuracy";

const COMPLEXITY_MAX = 50;

/**
 * Compute position complexity as win%(PV1) − win%(PV2), clamped to [0, 50].
 *
 * @param pv1EvalCp - Side-to-move eval (cp) for the best move (PV1).
 * @param pv2EvalCp - Side-to-move eval (cp) for the second-best move (PV2),
 *                    or null when there is only one legal move.
 * @returns Complexity in [0, 50]. Returns 0 when pv2EvalCp is null.
 */
export function moveComplexity(
	pv1EvalCp: number,
	pv2EvalCp: number | null,
): number {
	if (pv2EvalCp === null) return 0;
	const gap = cpToWinPct(pv1EvalCp) - cpToWinPct(pv2EvalCp);
	// PV1 is always >= PV2 by definition, but clamp to [0, MAX] for safety.
	return Math.min(COMPLEXITY_MAX, Math.max(0, gap));
}
