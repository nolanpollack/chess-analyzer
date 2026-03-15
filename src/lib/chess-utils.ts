/**
 * Chess utility functions shared by server, worker, and client code.
 */
import openings from "./openings.json";

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

/**
 * Returns all result_detail codes that belong to a given category.
 * Use this for filtering queries instead of maintaining a separate map.
 */
export function getResultDetails(category: ResultCategory): string[] {
	return Object.entries(RESULT_MAP)
		.filter(([, cat]) => cat === category)
		.map(([detail]) => detail);
}

// ── ECO Opening Lookup ─────────────────────────────────────────────────

// Build ECO → name map from the lichess dataset (first entry per ECO = base name,
// since the dataset is ordered from fewest moves to most within each ECO code).
const ECO_TO_NAME = new Map<string, string>();
for (const entry of openings) {
	if (!ECO_TO_NAME.has(entry.eco)) {
		ECO_TO_NAME.set(entry.eco, entry.name);
	}
}

/**
 * Returns the base opening name for an ECO code using the lichess openings dataset.
 * Returns null for unknown codes (e.g. games without a recognized opening).
 */
export function lookupOpeningName(eco: string): string | null {
	return ECO_TO_NAME.get(eco) ?? null;
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
 * Uses the [Opening] header if present, then falls back to looking up the
 * [ECO] code in the lichess openings dataset.
 * Returns null values for games without recognized openings (e.g. Chess960).
 */
export function parseOpeningFromPgn(pgn: string): {
	eco: string | null;
	name: string | null;
} {
	const eco = extractPgnHeader(pgn, "ECO");
	const name =
		extractPgnHeader(pgn, "Opening") ?? (eco ? lookupOpeningName(eco) : null);
	return { eco, name };
}
