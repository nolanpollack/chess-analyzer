import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { generateExplanation } from "#/features/explanations/server/mutations";
import { getExplanation } from "#/features/explanations/server/queries";

export function useMoveExplanation(
	gameAnalysisId: string | undefined,
	ply: number | null,
) {
	const queryClient = useQueryClient();
	const enabled = !!gameAnalysisId && ply !== null && ply > 0;

	const query = useQuery({
		queryKey: ["moveExplanation", gameAnalysisId, ply],
		queryFn: async () => {
			if (!gameAnalysisId || ply === null) return null;
			const result = await getExplanation({ data: { gameAnalysisId, ply } });
			if ("error" in result) throw new Error(result.error);
			return result;
		},
		enabled,
	});

	const generate = useMutation({
		mutationFn: async () => {
			if (!gameAnalysisId || ply === null)
				throw new Error("Missing context for explanation");
			const result = await generateExplanation({
				data: { gameAnalysisId, ply },
			});
			if ("error" in result) throw new Error(result.error);
			return result;
		},
		onSuccess: (data) => {
			queryClient.setQueryData(["moveExplanation", gameAnalysisId, ply], data);
		},
	});

	return { query, generate };
}
