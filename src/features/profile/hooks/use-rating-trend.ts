import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
	getRatingTrend,
	type TrendRange,
} from "#/features/profile/server/queries";

export function useRatingTrend(username: string, range: TrendRange) {
	return useQuery({
		queryKey: ["ratingTrend", username, range],
		queryFn: async () => {
			const result = await getRatingTrend({ data: { username, range } });
			if ("error" in result) throw new Error(result.error);
			return result.weeks;
		},
		placeholderData: keepPreviousData,
	});
}
