import { useQuery } from "@tanstack/react-query";
import { getAccuracyTrend } from "#/server/profile";

export function useAccuracyTrend(username: string) {
	return useQuery({
		queryKey: ["accuracyTrend", username],
		queryFn: () => getAccuracyTrend({ data: { username } }),
		enabled: !!username,
	});
}
