import { useQuery } from "@tanstack/react-query";
import { getAnalysisStatus } from "#/server/analysis";

type AnalysisStatusData = {
	status: "pending" | "complete" | "failed" | null;
	movesAnalyzed: number;
	totalMoves: number | null;
	error?: string;
};

export function useAnalysisStatus(gameId: string, enabled = true) {
	return useQuery<AnalysisStatusData>({
		queryKey: ["analysis-status", gameId],
		queryFn: async () => {
			const result = await getAnalysisStatus({ data: { gameId } });
			if ("error" in result) throw new Error(result.error);
			return result;
		},
		enabled: enabled && !!gameId,
		refetchInterval: (query) => {
			const data = query.state.data;
			// Poll while no status yet or while pending
			if (!data || data.status === null || data.status === "pending")
				return 2000;
			// Stop polling when complete or failed
			return false;
		},
	});
}
