import { useQuery } from "@tanstack/react-query";
import {
	type GameAnalysisStatus,
	getRecentGameAnalysisStatuses,
} from "#/features/games/server/analysis-queries";

/**
 * Polls analysis job statuses for a list of game IDs.
 * Polling stops when all games are complete or failed.
 */
export function useGameAnalysisStatuses(gameIds: string[]): {
	statusById: Map<string, GameAnalysisStatus>;
	isLoading: boolean;
} {
	const query = useQuery({
		queryKey: ["gameAnalysisStatuses", gameIds],
		queryFn: async () => {
			if (gameIds.length === 0) return [];
			const result = await getRecentGameAnalysisStatuses({
				data: { gameIds },
			});
			if ("error" in result) throw new Error(result.error);
			return result.statuses;
		},
		enabled: gameIds.length > 0,
		refetchInterval: (query) => {
			const statuses = query.state.data ?? [];
			const anyActive = statuses.some(
				(s) => s.status === "pending" || s.status === "in-progress",
			);
			return anyActive ? 1000 : false;
		},
	});

	const statusById = new Map<string, GameAnalysisStatus>(
		(query.data ?? []).map((s) => [s.gameId, s]),
	);

	return { statusById, isLoading: query.isLoading };
}
