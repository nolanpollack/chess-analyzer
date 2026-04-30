import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
	getRatingTrend,
	type RatingTrendPoint,
	type TrendRange,
} from "#/features/profile/server/queries";

const EMPTY = {
	points: [] as RatingTrendPoint[],
	firstGameDate: null,
	lastGameDate: null,
};

export function useRatingTrend(playerId: string | null, range: TrendRange) {
	return useQuery({
		queryKey: ["ratingTrend", playerId, range],
		queryFn: async () => {
			if (!playerId) return EMPTY;
			const result = await getRatingTrend({ data: { playerId, range } });
			if ("error" in result) throw new Error(result.error);
			return result;
		},
		enabled: !!playerId,
		placeholderData: keepPreviousData,
	});
}
