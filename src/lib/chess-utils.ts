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
 * Safely classifies a result and returns the badge variant for display.
 * Falls back to the raw result detail and "secondary" variant on unknown codes.
 */
export function getResultDisplay(resultDetail: string): {
	label: string;
	variant: "default" | "destructive" | "secondary";
} {
	let category: string;
	try {
		category = classifyResult(resultDetail);
	} catch {
		category = resultDetail;
	}

	const variant =
		category === "win"
			? "default"
			: category === "loss"
				? "destructive"
				: "secondary";

	return { label: category, variant };
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

// Build ECO → name map from the lichess dataset.
// For each ECO code, keep the entry with the shortest PGN — that's the base
// opening without any specific variation line.
const ECO_TO_NAME = new Map<string, string>();
const ecoBestPgnLength = new Map<string, number>();
for (const entry of openings) {
	const current = ecoBestPgnLength.get(entry.eco);
	if (current === undefined || entry.pgn.length < current) {
		ECO_TO_NAME.set(entry.eco, entry.name);
		ecoBestPgnLength.set(entry.eco, entry.pgn.length);
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
