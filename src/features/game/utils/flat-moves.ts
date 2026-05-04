import type { MoveAnalysis } from "#/db/schema";
import type { FlatMove } from "#/features/game/types";
import { parseTimeControl } from "#/lib/analysis/time-control";

type MoveInput = MoveAnalysis & { clock_remaining_ms: number | null };

/**
 * Flattens raw move rows into UI-shaped `FlatMove` objects, computing the
 * time spent on each move from the previous same-side clock plus the
 * time-control increment. `time_spent_ms` is null when clock data is
 * missing or the time control is unparseable (e.g. correspondence games).
 */
export function flattenMoves(
	moves: MoveInput[],
	timeControl: string | null = null,
): FlatMove[] {
	const tc = parseTimeControl(timeControl);
	const sorted = [...moves].sort((a, b) => a.ply - b.ply);

	let prevWhiteClock: number | null = tc?.baseMs ?? null;
	let prevBlackClock: number | null = tc?.baseMs ?? null;

	return sorted.map((m, i) => {
		const side = m.ply % 2 === 1 ? "white" : "black";
		const prev = side === "white" ? prevWhiteClock : prevBlackClock;
		const cur = m.clock_remaining_ms;

		let timeSpent: number | null = null;
		if (tc && prev !== null && cur !== null) {
			timeSpent = Math.max(0, prev - cur + tc.incrementMs);
		}

		if (cur !== null) {
			if (side === "white") prevWhiteClock = cur;
			else prevBlackClock = cur;
		}

		return {
			...m,
			index: i,
			moveNumber: Math.ceil(m.ply / 2),
			side,
			time_spent_ms: timeSpent,
		};
	});
}
