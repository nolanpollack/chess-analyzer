/**
 * Shared prompt helper utilities.
 * Format FEN context, eval values, and other data for LLM prompts.
 */

/**
 * Format a centipawn eval for display in prompts.
 * Always shows the sign for clarity.
 * Examples: 150 → "+1.50", -230 → "−2.30", 0 → "0.00"
 */
export function formatEvalForPrompt(cp: number): string {
	const value = (cp / 100).toFixed(2);
	if (cp > 0) return `+${value}`;
	if (cp < 0) return `${value}`;
	return "0.00";
}

/**
 * Format a sequence of moves for prompt context.
 * Shows move numbers appropriately (e.g. "22. Nf3 Bg7 23. O-O").
 */
export function formatMoveSequence(
	moves: { ply: number; san: string }[],
): string {
	if (moves.length === 0) return "(none)";

	const parts: string[] = [];
	for (const move of moves) {
		const moveNumber = Math.ceil(move.ply / 2);
		const isWhite = move.ply % 2 === 1;
		if (isWhite) {
			parts.push(`${moveNumber}. ${move.san}`);
		} else {
			// Only show move number for black if it's the first move in the sequence
			if (parts.length === 0) {
				parts.push(`${moveNumber}... ${move.san}`);
			} else {
				parts.push(move.san);
			}
		}
	}
	return parts.join(" ");
}

/**
 * Describe the classification in plain language for the prompt.
 */
export function classificationDescription(classification: string): string {
	switch (classification) {
		case "brilliant":
			return "a brilliant move (found a move better than the engine's initial suggestion)";
		case "best":
			return "the best move (matches the engine's recommendation)";
		case "good":
			return "a good move (close to optimal, minimal advantage lost)";
		case "inaccuracy":
			return "an inaccuracy (a suboptimal move that slightly worsens the position)";
		case "mistake":
			return "a mistake (a significant error that meaningfully changes the evaluation)";
		case "blunder":
			return "a blunder (a serious error that dramatically changes the evaluation)";
		default:
			return `classified as "${classification}"`;
	}
}
