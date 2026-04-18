import { useQuery } from "@tanstack/react-query";
import type { DimensionType } from "#/server/profile";
import { getDimensionDrilldown } from "#/server/profile";

export function useDimensionDrilldown(
	username: string,
	dimension: DimensionType,
	value: string,
) {
	return useQuery({
		queryKey: ["dimensionDrilldown", username, dimension, value],
		queryFn: () =>
			getDimensionDrilldown({
				data: { username, dimension, value },
			}),
		enabled: !!username && !!value,
	});
}
