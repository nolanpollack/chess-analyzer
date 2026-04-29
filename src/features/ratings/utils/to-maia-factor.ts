import type { DimensionType } from "#/config/dimensions";
import type { Factor, FactorConfidence } from "#/features/profile/types";
import { dimensionLabel } from "#/features/ratings/utils/labels";
import type { MaiaTagRating } from "#/lib/scoring/maia-tag-rating";

// Confidence thresholds based on CI width (ciHigh - ciLow in Elo points).
// A narrow CI (≤200) means Maia has seen enough positions to converge well;
// 200–500 is medium evidence; >500 is sparse. Below 5 positions we suppress.
const CI_HIGH_THRESHOLD = 200;
const CI_MEDIUM_THRESHOLD = 500;
const MIN_POSITIONS = 5;

function confidenceFromCI(
	ciLow: number,
	ciHigh: number,
	nPositions: number,
): FactorConfidence | "n/a" {
	if (nPositions < MIN_POSITIONS) return "n/a";
	const width = ciHigh - ciLow;
	if (width <= CI_HIGH_THRESHOLD) return "high";
	if (width <= CI_MEDIUM_THRESHOLD) return "medium";
	return "low";
}

/**
 * Maps a MaiaTagRating to the Factor view model consumed by FactorRow.
 * Returns null when nPositions < MIN_POSITIONS (show "—" in the UI instead).
 */
export function maiaTagRatingToFactor(
	dimensionType: DimensionType,
	rating: MaiaTagRating,
	baseline: number,
): Factor | null {
	const confidence = confidenceFromCI(
		rating.ciLow,
		rating.ciHigh,
		rating.nPositions,
	);
	if (confidence === "n/a") return null;

	return {
		id: `${dimensionType}:${rating.dimensionValue}`,
		label: dimensionLabel(dimensionType, rating.dimensionValue),
		value: Math.round(rating.predicted),
		confidence,
		delta: Math.round(rating.predicted - baseline),
		trend: [],
		group: dimensionType,
	};
}

export function maiaTagRatingsToFactors(
	dimensionType: DimensionType,
	ratings: MaiaTagRating[],
	baseline: number,
): Factor[] {
	return ratings
		.map((r) => maiaTagRatingToFactor(dimensionType, r, baseline))
		.filter((f): f is Factor => f !== null);
}
