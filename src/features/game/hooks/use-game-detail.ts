import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAnalysisStatus, getGameWithAnalysis } from "#/server/analysis";

export function useGameDetail(gameId: string) {
	const queryClient = useQueryClient();

	const detail = useQuery({
		queryKey: ["gameDetail", gameId],
		queryFn: async () => {
			const result = await getGameWithAnalysis({ data: { gameId } });
			if ("error" in result) throw new Error(result.error);
			return result;
		},
	});

	const isPending =
		detail.data?.analysis?.status === "pending" ||
		detail.data?.analysis?.status === undefined;

	useQuery({
		queryKey: ["analysisStatus", gameId],
		queryFn: async () => {
			const result = await getAnalysisStatus({ data: { gameId } });
			if (!("status" in result)) throw new Error(result.error);
			if (result.status === "complete" || result.status === "failed") {
				queryClient.invalidateQueries({ queryKey: ["gameDetail", gameId] });
			}
			return result;
		},
		enabled: !!detail.data && isPending && !!detail.data.game,
		refetchInterval: 3000,
	});

	return detail;
}
