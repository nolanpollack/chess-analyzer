import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export function useAnalysisLifecycle(
	gameId: string,
	polledStatus: string | null,
	cachedStatus: string | null,
) {
	const queryClient = useQueryClient();

	useEffect(() => {
		if (polledStatus === "complete" && cachedStatus !== "complete") {
			queryClient.invalidateQueries({ queryKey: ["game-analysis", gameId] });
		}
	}, [polledStatus, cachedStatus, gameId, queryClient]);
}
