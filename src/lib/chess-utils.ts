/**
 * Chess utility functions shared by server, worker, and client code.
 */

// ── Result Classification ──────────────────────────────────────────────

export type ResultCategory = "win" | "loss" | "draw";

const RESULT_MAP: Record<string, ResultCategory> = {
	win: "win",
	checkmated: "loss",
	timeout: "loss",
	resigned: "loss",
	lose: "loss",
	abandoned: "loss",
	stalemate: "draw",
	insufficient: "draw",
	repetition: "draw",
	agreed: "draw",
	timevsinsufficient: "draw",
	"50move": "draw",
};

/**
 * Maps a chess.com result_detail string to a display-friendly category.
 * Throws on unknown codes so we catch new ones immediately.
 */
export function classifyResult(resultDetail: string): ResultCategory {
	const category = RESULT_MAP[resultDetail];
	if (!category) {
		throw new Error(`Unknown chess.com result code: "${resultDetail}"`);
	}
	return category;
}

// ── PGN Header Parsing ─────────────────────────────────────────────────

/**
 * Extracts a single header value from a PGN string.
 * Returns null if the header is not found.
 */
function extractPgnHeader(pgn: string, header: string): string | null {
	const regex = new RegExp(`\\[${header}\\s+"([^"]*)"\\]`);
	const match = pgn.match(regex);
	return match?.[1] ?? null;
}

/**
 * Parses opening info from PGN headers.
 * Returns null values for games without ECO/Opening headers (e.g. Chess960).
 * Note: chess.com PGNs typically only have [ECO], not [Opening].
 */
export function parseOpeningFromPgn(pgn: string): {
	eco: string | null;
	name: string | null;
} {
	return {
		eco: extractPgnHeader(pgn, "ECO"),
		name: extractPgnHeader(pgn, "Opening"),
	};
}
