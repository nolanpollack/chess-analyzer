import { useQuery } from "@tanstack/react-query";
import { getPlayerSyncProgress } from "#/features/players/server/sync-queries";
import { usePlayerStatus } from "./use-player-status";

export type ProfileProgress = {
	/** Top-level state used by the topbar pill. */
	state: "idle" | "syncing" | "analyzing";
	isSyncing: boolean;
	lastSyncedAt: string | null;
	imported: number;
	/**
	 * Caller-supplied "total to import" hint — currently always 0 because the
	 * server can't know it cheaply. Kept on the type so the topbar pill can
	 * display "X of Y" once a future enhancement lands.
	 */
	totalGamesToImport: number;
	accuracy: number;
	gameRating: number;
	patterns: number;
	positionsAnalyzed: number;
};

/**
 * Returns combined sync + analysis progress for a player. Always-on:
 * polls every 3s while either a sync is active OR there is any analysis
 * backlog (any stage < imported), stops once everything is caught up.
 */
export function useProfileProgress(username: string): ProfileProgress | null {
	const { player, isSyncing } = usePlayerStatus(username);

	const query = useQuery({
		queryKey: ["profileProgress", username],
		queryFn: async () => {
			const result = await getPlayerSyncProgress({ data: { username } });
			if ("error" in result) throw new Error(result.error);
			return result.progress;
		},
		refetchInterval: (q) => {
			const data = q.state.data;
			if (!data) return isSyncing ? 3000 : false;
			const backlog =
				data.gamesImported > 0 &&
				(data.accuracyComplete < data.gamesImported ||
					data.gameRatingComplete < data.gamesImported ||
					data.patternsComplete < data.gamesImported);
			return isSyncing || backlog ? 3000 : false;
		},
	});

	if (!query.data && !player) return null;

	const data = query.data;
	const imported = data?.gamesImported ?? 0;
	const accuracy = data?.accuracyComplete ?? 0;
	const gameRating = data?.gameRatingComplete ?? 0;
	const patterns = data?.patternsComplete ?? 0;

	const hasBacklog =
		imported > 0 &&
		(accuracy < imported || gameRating < imported || patterns < imported);

	const state: ProfileProgress["state"] = isSyncing
		? "syncing"
		: hasBacklog
			? "analyzing"
			: "idle";

	return {
		state,
		isSyncing,
		lastSyncedAt: player?.lastSyncedAt ?? null,
		imported,
		totalGamesToImport: data?.totalGamesToImport ?? 0,
		accuracy,
		gameRating,
		patterns,
		positionsAnalyzed: data?.positionsAnalyzed ?? 0,
	};
}
