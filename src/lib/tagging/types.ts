/**
 * Tag generator interface. See docs/dimensional-ratings-plan.md §3.
 *
 * Generators receive a MoveContext and emit zero or more ProposedTags.
 * The runtime turns each ProposedTag into a `move_tags` row with the
 * generator's source/version stamped on it.
 */
import type { DimensionType } from "#/config/dimensions";
import type { games, moves, TagSourceType } from "#/db/schema";

export type Move = typeof moves.$inferSelect;
export type Game = typeof games.$inferSelect;

export interface MoveContext {
	move: Move;
	game: Game;
	/** Other moves in the same game, ordered by ply. Includes `move`. */
	allMoves: Move[];
}

export interface ProposedTag {
	dimensionType: DimensionType;
	dimensionValue: string;
	confidence?: number; // defaults to 1
	metadata?: Record<string, unknown>;
}

export interface TagGenerator {
	name: string;
	version: string;
	sourceType: TagSourceType;
	dimensionTypes: readonly DimensionType[];
	generate(ctx: MoveContext): ProposedTag[];
}
