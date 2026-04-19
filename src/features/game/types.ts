import type { MoveAnalysis } from "#/db/schema";
import type { getGameWithAnalysis } from "#/server/analysis";
import type { getGamePerformance } from "#/server/profile";

export type GameDetailResult = Awaited<ReturnType<typeof getGameWithAnalysis>>;
export type GameDetailOk = Extract<GameDetailResult, { game: unknown }>;

export type GamePerformanceResult = Awaited<
	ReturnType<typeof getGamePerformance>
>;
export type GamePerformanceOk = Extract<
	GamePerformanceResult,
	{ performance: unknown }
>;

export type FlatMove = MoveAnalysis & {
	index: number;
	moveNumber: number;
	side: "white" | "black";
};

export type GameFactor = {
	label: string;
	group: "phase" | "piece";
	value: number;
	delta: number;
	moveCount: number;
};
