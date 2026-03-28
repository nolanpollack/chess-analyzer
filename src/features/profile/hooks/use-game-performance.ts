import { useQuery } from "@tanstack/react-query";
import { getGamePerformance } from "#/server/profile";

export function useGamePerformance(gameAnalysisId: string | null) {
	return useQuery({
		queryKey: ["gamePerformance", gameAnalysisId],
		queryFn: () =>
			getGamePerformance({ data: { gameAnalysisId: gameAnalysisId! } }),
		enabled: !!gameAnalysisId,
	});
}
