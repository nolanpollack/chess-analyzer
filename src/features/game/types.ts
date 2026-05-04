import type { MoveAnalysis, PlayerColor } from "#/db/schema";
import type { getGameWithAnalysis } from "#/features/game/server/queries";

/**
 * Server function return types are derived so consumer types cannot drift
 * from the wire shape. The `*Ok` aliases pick the success branch of each
 * discriminated return (the non-`error` branch).
 */
export type GameDetailResult = Awaited<ReturnType<typeof getGameWithAnalysis>>;
export type GameDetailOk = Exclude<GameDetailResult, { error: string }>;

/**
 * A single move projected onto a flat list for UI display. Extends the raw
 * `MoveAnalysis` JSONB shape with position metadata computed by
 * `flattenMoves` in `utils/flat-moves.ts`, plus clock fields derived from
 * the PGN [%clk] annotations and the game's time control.
 */
export type FlatMove = MoveAnalysis & {
	index: number;
	moveNumber: number;
	side: PlayerColor;
	clock_remaining_ms: number | null;
	time_spent_ms: number | null;
};

/**
 * A single row in the per-game factor breakdown. Built by
 * `features/ratings/utils/to-maia-game-factor.ts` from per-game MaiaTagRatings.
 */
export type GameFactor = {
	label: string;
	group: "phase" | "piece" | "agency";
	value: number;
	delta: number;
	moveCount: number;
};
