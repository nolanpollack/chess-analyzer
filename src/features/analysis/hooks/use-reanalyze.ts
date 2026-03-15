import { useMutation, useQueryClient } from "@tanstack/react-query";
import { resetAndTriggerAnalysis } from "#/server/analysis";

export function useReanalyze(gameId: string) {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async () => {
			const result = await resetAndTriggerAnalysis({ data: { gameId } });
			if ("error" in result) throw new Error(result.error);
			return result;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["game-analysis", gameId] });
			queryClient.invalidateQueries({ queryKey: ["analysis-status", gameId] });
		},
	});
}
