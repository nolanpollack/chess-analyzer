/**
 * Dimension taxonomy — the single source of truth for dimension types and
 * their allowed values. Stored as text in `move_tags`; validated in code at
 * write time. Adding a dimension or value is a one-line change here +
 * registering a generator.
 *
 * See docs/dimensional-ratings-plan.md §3 for the design.
 */
import { CONCEPT_TAXONOMY } from "#/config/concepts";

export const DIMENSIONS = {
	phase: ["opening", "middlegame", "endgame"],
	piece: ["pawn", "knight", "bishop", "rook", "queen", "king"],
	concept: CONCEPT_TAXONOMY.map((c) => c.id),
	// Phase 4: agency = forcing | reactive | proactive | speculative
} as const satisfies Record<string, readonly string[]>;

export type DimensionType = keyof typeof DIMENSIONS;

export const DIMENSION_TYPES = Object.keys(DIMENSIONS) as DimensionType[];

export function isDimensionType(s: string): s is DimensionType {
	return s in DIMENSIONS;
}

export function isValidDimensionValue(
	dim: DimensionType,
	value: string,
): boolean {
	return (DIMENSIONS[dim] as readonly string[]).includes(value);
}
