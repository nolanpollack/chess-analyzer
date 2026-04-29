import { useQuery } from "@tanstack/react-query";
import { getMaiaTagRatings } from "#/features/ratings/server/maia-queries";
import type { MaiaTagRating } from "#/lib/scoring/maia-tag-rating";

type UseMaiaTagRatingsInput = {
	playerId: string;
	dimensionType: string;
	dimensionValue?: string;
	windowKey?: "trailing_20";
};

export function useMaiaTagRatings(input: UseMaiaTagRatingsInput): {
	ratings: MaiaTagRating[];
	isLoading: boolean;
	isError: boolean;
} {
	const query = useQuery({
		queryKey: [
			"maiaTagRatings",
			input.playerId,
			input.dimensionType,
			input.dimensionValue ?? null,
			input.windowKey ?? "trailing_20",
		],
		queryFn: async () => {
			const result = await getMaiaTagRatings({
				data: {
					playerId: input.playerId,
					dimensionType: input.dimensionType,
					dimensionValue: input.dimensionValue,
					windowKey: input.windowKey ?? "trailing_20",
				},
			});
			if ("error" in result) throw new Error(result.error);
			return result.ratings;
		},
		enabled: !!input.playerId,
	});

	return {
		ratings: query.data ?? [],
		isLoading: query.isLoading,
		isError: query.isError,
	};
}
