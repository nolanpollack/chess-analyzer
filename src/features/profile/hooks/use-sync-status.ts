import { useMutation, useQuery } from "@tanstack/react-query";
import { getPlayerStatus, syncPlayer } from "#/server/players";

export function useSyncStatus(username: string) {
	const statusQuery = useQuery({
		queryKey: ["playerStatus", username],
		queryFn: () => getPlayerStatus({ data: { username } }),
		refetchInterval: (query) => {
			const data = query.state.data;
			if (data && "found" in data && data.found && data.isSyncing) return 3000;
			return false;
		},
	});

	const syncMutation = useMutation({
		mutationFn: () => syncPlayer({ data: { username } }),
		onSuccess: () => {
			void statusQuery.refetch();
		},
	});

	const playerStatus =
		statusQuery.data && "found" in statusQuery.data && statusQuery.data.found
			? statusQuery.data
			: null;

	return {
		playerStatus,
		isLoading: statusQuery.isLoading,
		isSyncing: playerStatus?.isSyncing ?? false,
		lastSyncedAt: playerStatus?.player?.lastSyncedAt ?? null,
		syncMutation,
	};
}
