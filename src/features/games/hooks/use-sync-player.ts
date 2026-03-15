import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { syncPlayer } from "#/server/players";

export function useSyncPlayer(username: string, serverIsSyncing: boolean) {
	const queryClient = useQueryClient();

	const syncMutation = useMutation({
		mutationFn: async () => {
			const result = await syncPlayer({ data: { username } });
			if ("error" in result) throw new Error(result.error);
			return result;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["playerStatus", username] });
		},
	});

	const isSyncing = serverIsSyncing || syncMutation.isPending;

	// When syncing transitions from true → false, invalidate games so the list refreshes
	const prevSyncingRef = useRef(isSyncing);
	useEffect(() => {
		if (prevSyncingRef.current && !isSyncing) {
			queryClient.invalidateQueries({
				queryKey: ["games", username],
				exact: false,
			});
		}
		prevSyncingRef.current = isSyncing;
	}, [isSyncing, queryClient, username]);

	return { syncMutation, isSyncing };
}
