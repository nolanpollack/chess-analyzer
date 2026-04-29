import { useQuery } from "@tanstack/react-query";
import { getPlayerSyncProgress } from "#/features/players/server/sync-queries";
import type { SyncProgress } from "#/features/profile/components/SyncStatusButton";
import { usePlayerStatus } from "./use-player-status";

/**
 * Returns a `SyncProgress` object for wiring into SyncStatusButton.
 * Polls every 3 s while syncing, stops when idle.
 * Does NOT break existing `usePlayerStatus` call sites.
 */
export function useSyncProgress(username: string): SyncProgress | undefined {
	const { isSyncing } = usePlayerStatus(username);

	const query = useQuery({
		queryKey: ["syncProgress", username],
		queryFn: async () => {
			const result = await getPlayerSyncProgress({ data: { username } });
			if ("error" in result) throw new Error(result.error);
			return result.progress;
		},
		enabled: isSyncing,
		refetchInterval: isSyncing ? 3000 : false,
	});

	if (!isSyncing) return undefined;

	return {
		status: "syncing",
		gamesImported: query.data?.gamesImported ?? 0,
		totalGamesToImport: query.data?.totalGamesToImport ?? 0,
		gamesAnalyzed: query.data?.gamesAnalyzed ?? 0,
	};
}
