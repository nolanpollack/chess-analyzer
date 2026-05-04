import type { GameFactor } from "#/features/game/types";
import {
	dimensionLabel,
	dimensionSortKey,
} from "#/features/ratings/utils/labels";
import type { MaiaTagRating } from "#/lib/scoring/maia-tag-rating";

const MIN_POSITIONS = 3;

/**
 * Maps per-game MaiaTagRatings to the GameFactor[] shape for the game-page
 * FactorBreakdownCard. Concept tags are excluded (too sparse at single-game scale).
 * Rows with fewer than MIN_POSITIONS are excluded to avoid showing noisy estimates.
 */
export function maiaTagRatingsToGameFactors(
	dimensionType: "phase" | "piece" | "agency",
	ratings: MaiaTagRating[],
	overallElo: number,
): GameFactor[] {
	return ratings
		.filter((r) => r.nPositions >= MIN_POSITIONS)
		.map((r) => ({
			label: dimensionLabel(dimensionType, r.dimensionValue),
			group: dimensionType,
			value: Math.round(r.predicted),
			delta: Math.round(r.predicted - overallElo),
			moveCount: r.nPositions,
			sortKey: dimensionSortKey(dimensionType, r.dimensionValue),
		}))
		.sort((a, b) => a.sortKey - b.sortKey)
		.map(({ sortKey: _sortKey, ...rest }) => rest);
}
