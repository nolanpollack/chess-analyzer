import type { Factor, FactorConfidence } from "#/features/profile/types";
import type { DimensionScore } from "#/features/ratings/server/queries";
import { dimensionLabel } from "#/features/ratings/utils/labels";

const HIGH_CONFIDENCE_SAMPLES = 50;
const MEDIUM_CONFIDENCE_SAMPLES = 20;

export function confidenceFromSampleSize(n: number): FactorConfidence {
	if (n >= HIGH_CONFIDENCE_SAMPLES) return "high";
	if (n >= MEDIUM_CONFIDENCE_SAMPLES) return "medium";
	return "low";
}

export function toFactor(score: DimensionScore): Factor {
	return {
		id: `${score.dimensionType}:${score.dimensionValue}`,
		label: dimensionLabel(score.dimensionType, score.dimensionValue),
		value: score.ratingEstimate,
		confidence: confidenceFromSampleSize(score.sampleSize),
		// Per-factor delta and trend require historical snapshots — deferred.
		delta: 0,
		trend: [],
		group: score.dimensionType,
	};
}

export function toFactors(scores: DimensionScore[]): Factor[] {
	return scores.map(toFactor);
}
