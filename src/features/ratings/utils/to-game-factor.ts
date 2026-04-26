import type { GameFactor } from "#/features/game/types";
import type { DimensionScore } from "#/features/ratings/server/queries";
import {
	dimensionLabel,
	dimensionSortKey,
} from "#/features/ratings/utils/labels";

/**
 * Maps per-game DimensionScores to the legacy GameFactor[] shape consumed by
 * the game-page FactorBreakdownCard. Rows are sorted within their group by
 * the conventional ordering in `labels.ts` (pieces pawn→king, phases
 * opening→endgame, agency forcing→proactive). Concept tags are dropped from
 * the per-game view — they're sparse and individually unhelpful at single-
 * game scale.
 *
 * `delta` is the gap from the per-game overall Elo (per the existing UI
 * convention that game-page deltas are vs. that game's average, not the
 * player average).
 */
export function toGameFactors(
	scores: DimensionScore[],
	gameOverallElo: number,
): GameFactor[] {
	const visibleGroups = new Set(["phase", "piece", "agency"] as const);
	return scores
		.filter((s) => (visibleGroups as Set<string>).has(s.dimensionType))
		.map((s) => ({
			label: dimensionLabel(s.dimensionType, s.dimensionValue),
			group: s.dimensionType as "phase" | "piece" | "agency",
			value: s.ratingEstimate,
			delta: s.ratingEstimate - gameOverallElo,
			moveCount: s.sampleSize,
			sortKey: dimensionSortKey(s.dimensionType, s.dimensionValue),
		}))
		.sort((a, b) => a.sortKey - b.sortKey)
		.map(({ sortKey: _sortKey, ...rest }) => rest);
}
