import type { MoveAnalysis, PlayerColor } from "#/db/schema";
import type {
	getGamePerformance,
	getGameWithAnalysis,
} from "#/features/game/server/queries";

/**
 * Server function return types are derived so consumer types cannot drift
 * from the wire shape. The `*Ok` aliases pick the success branch of each
 * discriminated return (the non-`error` branch).
 */
export type GameDetailResult = Awaited<ReturnType<typeof getGameWithAnalysis>>;
export type GameDetailOk = Exclude<GameDetailResult, { error: string }>;

export type GamePerformanceResult = Awaited<
	ReturnType<typeof getGamePerformance>
>;
export type GamePerformanceOk = Exclude<
	GamePerformanceResult,
	{ error: string }
>;

/**
 * A single move projected onto a flat list for UI display. Extends the raw
 * `MoveAnalysis` JSONB shape with position metadata computed by
 * `flattenMoves` in `utils/flat-moves.ts`.
 */
export type FlatMove = MoveAnalysis & {
	index: number;
	moveNumber: number;
	side: PlayerColor;
};

/**
 * A single row in the per-game factor breakdown (phase or piece strength).
 * Built by `utils/factor-breakdown.ts` from a GamePerformance row.
 */
export type GameFactor = {
	label: string;
	group: "phase" | "piece";
	value: number;
	delta: number;
	moveCount: number;
};
