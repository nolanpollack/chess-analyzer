/**
 * UI-only view models for the profile dashboard. These are not wire DTOs —
 * they're shapes the profile screen constructs from server data. Types that
 * describe server function output should be derived via
 * `Awaited<ReturnType<typeof fn>>` at the consumption site, not duplicated
 * here.
 */

export type PlayerSummary = {
	currentRating: number | null;
	gameCount: number;
	analyzedGameCount: number;
	eloEstimate: number | null;
	eloDelta30d: number | null;
};

export type RatingPoint = {
	weekStart: string;
	rating: number;
};

export type FactorConfidence = "high" | "medium" | "low";
export type FactorGroup = "phase" | "skill" | "piece" | "agency" | "concept";

export type Factor = {
	id: string;
	label: string;
	value: number;
	confidence: FactorConfidence;
	delta: number;
	trend: number[];
	group: FactorGroup;
};

export type FocusArea = {
	id: string;
	title: string;
	detail: string;
	factors: string[];
	gap: number;
	confidence: FactorConfidence;
	positions: number;
};
