import { useQueries } from "@tanstack/react-query";
import { DIMENSION_TYPES, type DimensionType } from "#/config/dimensions";
import type { Factor } from "#/features/profile/types";
import {
	type DimensionScore,
	getDimensionScoresForPlayer,
} from "#/features/ratings/server/queries";
import { toFactors } from "#/features/ratings/utils/to-factor";

type UseDimensionRatingsResult = {
	factors: Factor[];
	isLoading: boolean;
	isError: boolean;
};

export function useDimensionRatings(
	username: string,
): UseDimensionRatingsResult {
	const queries = useQueries({
		queries: DIMENSION_TYPES.map((dimensionType: DimensionType) => ({
			queryKey: ["dimensionScores", username, dimensionType] as const,
			queryFn: async (): Promise<DimensionScore[]> => {
				const result = await getDimensionScoresForPlayer({
					data: { username, dimensionType },
				});
				if ("error" in result) throw new Error(result.error);
				return result.scores;
			},
		})),
	});

	const isLoading = queries.some((q) => q.isLoading);
	const isError = queries.some((q) => q.isError);
	const scores = queries.flatMap((q) => q.data ?? []);
	return { factors: toFactors(scores), isLoading, isError };
}
