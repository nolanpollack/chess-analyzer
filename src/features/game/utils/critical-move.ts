import type { FlatMove } from "#/features/game/types";

export function findCriticalMoveIndex(moves: FlatMove[]): number {
	let worstIdx = -1;
	let worstDelta = 0;
	for (const m of moves) {
		if (!m.is_player_move) continue;
		if (m.eval_delta < worstDelta) {
			worstDelta = m.eval_delta;
			worstIdx = m.index;
		}
	}
	return worstIdx;
}
