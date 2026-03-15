import { useQuery } from "@tanstack/react-query";
import { getPlayerStatus } from "#/server/players";

export function usePlayerStatus(username: string) {
	return useQuery({
		queryKey: ["playerStatus", username],
		queryFn: async () => {
			const result = await getPlayerStatus({ data: { username } });
			if ("error" in result) throw new Error(result.error);
			return result;
		},
		refetchInterval: (query) => {
			const data = query.state.data;
			if (data && "found" in data && data.found && data.isSyncing) {
				return 3000;
			}
			return false;
		},
	});
}
