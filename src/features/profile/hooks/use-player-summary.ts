import { useQuery } from "@tanstack/react-query";
import { getPlayerSummary } from "#/server/profile";

export function usePlayerSummary(username: string) {
	return useQuery({
		queryKey: ["playerSummary", username],
		queryFn: async () => {
			const result = await getPlayerSummary({ data: { username } });
			if ("error" in result) throw new Error(result.error);
			return result.summary;
		},
	});
}
