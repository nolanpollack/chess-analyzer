import type { MoveAnalysis } from "#/db/schema";
import type { FlatMove } from "#/features/game/types";

export function flattenMoves(moves: MoveAnalysis[]): FlatMove[] {
	const sorted = [...moves].sort((a, b) => a.ply - b.ply);
	return sorted.map((m, i) => ({
		...m,
		index: i,
		moveNumber: Math.floor(m.ply / 2) + 1,
		side: m.ply % 2 === 0 ? "white" : "black",
	}));
}
