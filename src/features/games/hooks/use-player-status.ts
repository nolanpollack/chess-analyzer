import { useQuery } from "@tanstack/react-query";
import { getPlayerStatus } from "#/server/players";

export function usePlayerStatus(username: string) {
	return useQuery({
		queryKey: ["playerStatus", username],
		queryFn: () => getPlayerStatus({ data: { username } }),
		refetchInterval: (query) => {
			const data = query.state.data;
			if (data && "found" in data && data.found && data.isSyncing) {
				return 3000;
			}
			return false;
		},
	});
}
