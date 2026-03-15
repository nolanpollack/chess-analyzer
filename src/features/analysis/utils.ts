/**
 * Analysis UI utilities: eval formatting, classification colors, etc.
 */
import type { MoveClassification } from "#/db/schema";

// ── Eval Formatting ────────────────────────────────────────────────────

/**
 * Format a centipawn eval for display.
 * Examples: 150 → "+1.5", -230 → "-2.3", 0 → "0.0"
 */
export function formatEval(cp: number, clamp?: number): string {
	const clamped = clamp ? Math.max(-clamp, Math.min(clamp, cp)) : cp;
	const value = (clamped / 100).toFixed(1);
	if (clamped > 0) return `+${value}`;
	return value;
}

/**
 * Format a mate score for display.
 * Examples: 3 → "M3", -5 → "-M5"
 */
export function formatMateScore(mateIn: number): string {
	if (mateIn > 0) return `M${mateIn}`;
	return `-M${Math.abs(mateIn)}`;
}

/**
 * Check if an eval represents a mate score (very large absolute value).
 */
export function isMateScore(cp: number): boolean {
	return Math.abs(cp) >= 90000;
}

/**
 * Extract mate-in-N from a large centipawn value.
 * The conversion is: cp = ±(100000 - N)
 */
export function extractMateIn(cp: number): number {
	if (cp > 0) return 100000 - cp;
	return -(100000 + cp);
}

/**
 * Format an eval value for display, handling both centipawn and mate scores.
 */
export function formatEvalDisplay(cp: number, clamp?: number): string {
	if (isMateScore(cp)) {
		return formatMateScore(extractMateIn(cp));
	}
	return formatEval(cp, clamp);
}

// ── Classification Colors ──────────────────────────────────────────────

type ClassificationStyle = {
	bg: string;
	text: string;
	label: string;
};

const CLASSIFICATION_STYLES: Record<MoveClassification, ClassificationStyle> = {
	brilliant: {
		bg: "bg-cyan-500/15",
		text: "text-cyan-600 dark:text-cyan-400",
		label: "Brilliant",
	},
	best: {
		bg: "bg-emerald-500/15",
		text: "text-emerald-600 dark:text-emerald-400",
		label: "Best",
	},
	good: {
		bg: "bg-emerald-500/10",
		text: "text-emerald-600 dark:text-emerald-400",
		label: "Good",
	},
	inaccuracy: {
		bg: "bg-yellow-500/15",
		text: "text-yellow-600 dark:text-yellow-400",
		label: "Inaccuracy",
	},
	mistake: {
		bg: "bg-amber-500/15",
		text: "text-amber-600 dark:text-amber-400",
		label: "Mistake",
	},
	blunder: {
		bg: "bg-red-500/15",
		text: "text-red-600 dark:text-red-400",
		label: "Blunder",
	},
};

export function getClassificationStyle(
	classification: MoveClassification,
): ClassificationStyle {
	return CLASSIFICATION_STYLES[classification];
}

/**
 * Get the arrow color for a move classification (used on the board).
 */
export function getClassificationArrowColor(
	classification: MoveClassification,
): string {
	switch (classification) {
		case "brilliant":
			return "rgb(6, 182, 212)"; // cyan-500
		case "best":
			return "rgb(16, 185, 129)"; // emerald-500
		case "good":
			return "rgb(16, 185, 129)"; // emerald-500
		case "inaccuracy":
			return "rgb(234, 179, 8)"; // yellow-500
		case "mistake":
			return "rgb(245, 158, 11)"; // amber-500
		case "blunder":
			return "rgb(239, 68, 68)"; // red-500
	}
}
