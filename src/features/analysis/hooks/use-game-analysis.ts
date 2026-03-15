import { useQuery } from "@tanstack/react-query";
import { getGameWithAnalysis } from "#/server/analysis";

export function useGameAnalysis(gameId: string) {
	return useQuery({
		queryKey: ["game-analysis", gameId],
		queryFn: async () => {
			const result = await getGameWithAnalysis({ data: { gameId } });
			if ("error" in result) throw new Error(result.error);
			return result;
		},
		enabled: !!gameId,
	});
}
