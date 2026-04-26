import { useQuery } from "@tanstack/react-query";
import { getGameDimensionScores } from "#/features/ratings/server/queries";

export function useGameDimensionRatings(gameId: string | undefined) {
	return useQuery({
		queryKey: ["gameDimensionScores", gameId],
		queryFn: async () => {
			if (!gameId) return null;
			const result = await getGameDimensionScores({ data: { gameId } });
			if ("error" in result) throw new Error(result.error);
			return result;
		},
		enabled: !!gameId,
	});
}
