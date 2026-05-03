import type { MoveAnalysis } from "#/db/schema";
import type { FlatMove } from "#/features/game/types";

export function flattenMoves(moves: MoveAnalysis[]): FlatMove[] {
	const sorted = [...moves].sort((a, b) => a.ply - b.ply);
	return sorted.map((m, i) => ({
		...m,
		index: i,
		moveNumber: Math.ceil(m.ply / 2),
		side: m.ply % 2 === 1 ? "white" : "black",
	}));
}
