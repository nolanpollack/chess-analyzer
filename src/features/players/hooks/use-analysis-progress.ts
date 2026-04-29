import { useQuery } from "@tanstack/react-query";
import { getPlayerSyncProgress } from "#/features/players/server/sync-queries";

export type AnalysisProgressData = {
	imported: number;
	analyzed: number;
};

/**
 * Returns the global analyzed/imported counts for a player, regardless of
 * whether a sync is currently active. Useful for surfacing "X of N analyzed"
 * during re-analysis or backfill, when usePlayerStatus.isSyncing is false.
 *
 * Polls every 3 s while there is a gap (analyzed < imported). Stops once
 * everything is analyzed.
 */
export function useAnalysisProgress(
	username: string,
): AnalysisProgressData | undefined {
	const query = useQuery({
		queryKey: ["analysisProgress", username],
		queryFn: async () => {
			const result = await getPlayerSyncProgress({ data: { username } });
			if ("error" in result) throw new Error(result.error);
			return result.progress;
		},
		refetchInterval: (q) => {
			const data = q.state.data;
			if (!data) return false;
			return data.gamesAnalyzed < data.gamesImported ? 3000 : false;
		},
	});

	if (!query.data) return undefined;
	return {
		imported: query.data.gamesImported,
		analyzed: query.data.gamesAnalyzed,
	};
}
