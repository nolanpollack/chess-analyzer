import { useQuery } from "@tanstack/react-query";
import { getGamePerformance } from "#/features/game/server/queries";

export function useGamePerformance(gameAnalysisId: string | undefined) {
	return useQuery({
		queryKey: ["gamePerformance", gameAnalysisId],
		queryFn: async () => {
			if (!gameAnalysisId) return null;
			const result = await getGamePerformance({ data: { gameAnalysisId } });
			return result.performance;
		},
		enabled: !!gameAnalysisId,
	});
}
