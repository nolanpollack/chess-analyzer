import { useQuery } from "@tanstack/react-query";
import { getMaiaGameRating } from "#/features/ratings/server/maia-queries";

type MaiaSideRating = {
	predicted: number;
	ciLow: number;
	ciHigh: number;
	nPositions: number;
};

type MaiaGameRating = {
	maiaVersion: string | null;
	white: MaiaSideRating | null;
	black: MaiaSideRating | null;
};

export function useMaiaGameRating(analysisJobId: string | undefined) {
	return useQuery<MaiaGameRating | null>({
		queryKey: ["maiaGameRating", analysisJobId],
		queryFn: async () => {
			if (!analysisJobId) return null;
			const result = await getMaiaGameRating({ data: { analysisJobId } });
			if ("error" in result) throw new Error(result.error);
			return result;
		},
		enabled: !!analysisJobId,
	});
}
