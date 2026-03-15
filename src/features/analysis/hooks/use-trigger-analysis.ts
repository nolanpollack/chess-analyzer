import { useMutation } from "@tanstack/react-query";
import { triggerAnalysis } from "#/server/analysis";

export function useTriggerAnalysis(gameId: string, onSuccess?: () => void) {
	return useMutation({
		mutationFn: async () => {
			const result = await triggerAnalysis({ data: { gameId } });
			if ("error" in result) throw new Error(result.error);
			return result;
		},
		onSuccess: () => onSuccess?.(),
	});
}
