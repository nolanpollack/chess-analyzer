import { useMutation, useQueryClient } from "@tanstack/react-query";
import { syncPlayer } from "../server/mutations";
import { playerStatusQueryKey } from "./use-player-status";

export function useSyncPlayer(username: string) {
	const queryClient = useQueryClient();

	const syncMutation = useMutation({
		mutationFn: () => syncPlayer({ data: { username } }),
		onMutate: () => {
			// Optimistically mark as syncing so the UI responds immediately,
			// before the server round-trip completes.
			const key = playerStatusQueryKey(username);
			const prev = queryClient.getQueryData(key);
			if (prev && typeof prev === "object" && "found" in prev && prev.found) {
				queryClient.setQueryData(key, { ...prev, isSyncing: true });
			}
		},
		onSettled: () => {
			// Invalidate both queries so polling restarts with fresh server state.
			// invalidateQueries refetches active subscribers immediately, which
			// re-evaluates their refetchInterval (every 1s when isSyncing).
			void queryClient.invalidateQueries({
				queryKey: playerStatusQueryKey(username),
			});
			void queryClient.invalidateQueries({
				queryKey: ["profileProgress", username],
			});
		},
	});

	return { sync: () => syncMutation.mutate() };
}
