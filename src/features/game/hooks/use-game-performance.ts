import { useQuery } from "@tanstack/react-query";
import { getGamePerformance } from "#/features/profile/server/profile";

export function useGamePerformance(gameAnalysisId: string | undefined) {
	return useQuery({
		queryKey: ["gamePerformance", gameAnalysisId],
		queryFn: async () => {
			if (!gameAnalysisId) return null;
			const result = await getGamePerformance({ data: { gameAnalysisId } });
			if ("error" in result) throw new Error(result.error);
			return result.performance;
		},
		enabled: !!gameAnalysisId,
	});
}
