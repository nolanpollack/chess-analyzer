import type { getGameWithAnalysis } from "#/server/analysis";
import type { getGame } from "#/server/games";

export type GameWithAnalysis = NonNullable<
	Awaited<ReturnType<typeof getGameWithAnalysis>>
>;
export type GameDetail = NonNullable<Awaited<ReturnType<typeof getGame>>>;
export type AnalysisData = NonNullable<GameWithAnalysis["analysis"]>;
export type MoveList = AnalysisData["moves"];
