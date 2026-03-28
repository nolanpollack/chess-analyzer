/**
 * Hook to trigger explanation generation for a specific move.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { generateExplanation } from "#/server/explanations";

export function useGenerateExplanation(gameAnalysisId: string | null) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (ply: number) => {
			if (!gameAnalysisId) throw new Error("No analysis ID");
			const result = await generateExplanation({
				data: { gameAnalysisId, ply },
			});
			if ("error" in result) throw new Error(result.error);
			return result;
		},
		onSuccess: (_data, ply) => {
			// Invalidate the explanation query so it refetches the cached result
			queryClient.invalidateQueries({
				queryKey: ["explanation", gameAnalysisId, ply],
			});
		},
	});
}
