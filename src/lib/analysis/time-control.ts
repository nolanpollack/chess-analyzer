/**
 * Parses the chess.com / lichess `time_control` string into base + increment
 * milliseconds. Returns null for correspondence ("1/86400") or unparseable
 * formats — callers should skip clock-derived UI when this is null.
 *
 * Accepted forms:
 *   "180"    → 3 min, no increment
 *   "180+2"  → 3 min, 2 s increment
 *   "600+5"  → 10 min, 5 s increment
 */
export type TimeControl = { baseMs: number; incrementMs: number };

export function parseTimeControl(
	tc: string | null | undefined,
): TimeControl | null {
	if (!tc) return null;
	const match = /^(\d+)(?:\+(\d+))?$/.exec(tc.trim());
	if (!match) return null;
	const base = Number.parseInt(match[1], 10);
	const inc = match[2] ? Number.parseInt(match[2], 10) : 0;
	if (!Number.isFinite(base) || base <= 0) return null;
	return { baseMs: base * 1000, incrementMs: inc * 1000 };
}
