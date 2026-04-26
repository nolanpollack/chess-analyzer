import { Chess, type Color, type Square } from "chess.js";
import type { TagGenerator } from "#/lib/tagging/types";

/**
 * Agency: what kind of intent does this move express?
 *
 *   forcing    — the move imposes on the opponent (check, checkmate, capture).
 *                This is the strongest classification; it wins ties.
 *   reactive   — the moved piece was under attack at fenBefore. A response
 *                to a threat, not a self-driven plan.
 *   proactive  — neither. A quiet, self-directed move.
 *
 * "speculative" (sacrifice detection) is deferred until a generator that
 * looks at material delta + best-move comparisons exists.
 */

type Agency = "forcing" | "reactive" | "proactive";

function isForcing(san: string): boolean {
	return san.includes("+") || san.includes("#") || san.includes("x");
}

function isReactive(fenBefore: string, uci: string, mover: Color): boolean {
	const fromSquare = uci.slice(0, 2) as Square;
	const opponent: Color = mover === "w" ? "b" : "w";
	const chess = new Chess(fenBefore);
	return chess.isAttacked(fromSquare, opponent);
}

function classify(
	san: string,
	fenBefore: string,
	uci: string,
	mover: Color,
): Agency {
	if (isForcing(san)) return "forcing";
	if (isReactive(fenBefore, uci, mover)) return "reactive";
	return "proactive";
}

export const agencyGenerator: TagGenerator = {
	name: "agency",
	version: "v1",
	sourceType: "heuristic",
	dimensionTypes: ["agency"],

	generate(ctx) {
		const { san, uci, fenBefore, color } = ctx.move;
		const mover: Color = color === "white" ? "w" : "b";
		const value = classify(san, fenBefore, uci, mover);
		return [{ dimensionType: "agency", dimensionValue: value }];
	},
};
