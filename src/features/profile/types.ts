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
export type FactorGroup = "phase" | "skill" | "piece";

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

export type GameResultLetter = "W" | "L" | "D";
