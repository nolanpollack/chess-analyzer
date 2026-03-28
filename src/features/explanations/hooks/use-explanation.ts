/**
 * Hook to fetch a cached explanation for a specific move.
 */
import { useQuery } from "@tanstack/react-query";
import { getExplanation } from "#/server/explanations";

export function useExplanation(gameAnalysisId: string | null, ply: number) {
	return useQuery({
		queryKey: ["explanation", gameAnalysisId, ply],
		queryFn: async () => {
			if (!gameAnalysisId) return null;
			const result = await getExplanation({
				data: { gameAnalysisId, ply },
			});
			if ("error" in result) throw new Error(result.error);
			return result;
		},
		enabled: !!gameAnalysisId && ply > 0,
	});
}
