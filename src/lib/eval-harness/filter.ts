/**
 * Game filtering for the eval harness.
 * Only games passing all criteria are sampled.
 */

export type GameHeaders = {
	Variant?: string;
	Rated?: string;
	Event?: string;
	WhiteElo?: string;
	BlackElo?: string;
	TimeControl?: string;
};

export type TimeControlClass = "blitz" | "rapid";

/**
 * Classifies a time control string ("<base>+<inc>") into blitz or rapid.
 * Returns null if the format is invalid or the class is not supported.
 * Blitz: effective seconds 180–480; rapid: 481–1500.
 */
export function classifyTimeControl(tc: string): TimeControlClass | null {
	const match = tc.match(/^(\d+)\+(\d+)$/);
	if (!match) return null;
	const base = parseInt(match[1], 10);
	const inc = parseInt(match[2], 10);
	const effective = base + 40 * inc; // standard effective time formula
	if (effective >= 180 && effective <= 480) return "blitz";
	if (effective >= 481 && effective <= 1500) return "rapid";
	return null;
}

/**
 * Returns true iff the game should be included in the eval set.
 */
export function applyEvalFilters(
	headers: GameHeaders,
	plyCount: number,
): boolean {
	// Standard variant only (missing Variant header means standard on Lichess)
	if (headers.Variant !== undefined && headers.Variant !== "Standard") {
		return false;
	}

	// Rated games only.
	// Lichess PGNs encode this in the Event header (e.g. "Rated Blitz game")
	// rather than a separate Rated header.
	const rated = headers.Rated?.toLowerCase();
	const eventIsRated = headers.Event?.toLowerCase().startsWith("rated");
	if (rated !== "true" && !eventIsRated) return false;

	// Both elos present and >= 600
	const whiteElo = headers.WhiteElo ? parseInt(headers.WhiteElo, 10) : NaN;
	const blackElo = headers.BlackElo ? parseInt(headers.BlackElo, 10) : NaN;
	if (Number.isNaN(whiteElo) || Number.isNaN(blackElo)) return false;
	if (whiteElo < 600 || blackElo < 600) return false;

	// Blitz or rapid only
	if (!headers.TimeControl) return false;
	const tcClass = classifyTimeControl(headers.TimeControl);
	if (tcClass === null) return false;

	// Minimum ply count
	if (plyCount < 10) return false;

	return true;
}
