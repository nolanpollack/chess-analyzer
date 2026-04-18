import { useQuery } from "@tanstack/react-query";
import { getGamePerformance } from "#/server/profile";

export function useGamePerformance(gameAnalysisId: string | null) {
	return useQuery({
		queryKey: ["gamePerformance", gameAnalysisId],
		queryFn: () => {
			if (!gameAnalysisId) {
				throw new Error("Missing game analysis id");
			}
			return getGamePerformance({ data: { gameAnalysisId } });
		},
		enabled: !!gameAnalysisId,
	});
}
