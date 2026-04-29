import { useQuery } from "@tanstack/react-query";
import { getGamesStats } from "#/features/games/server/queries";
import type { GamesQueryFilters } from "./use-games";

type UseGamesStatsArgs = {
	username: string;
	filters: GamesQueryFilters;
};

export function useGamesStats({ username, filters }: UseGamesStatsArgs) {
	return useQuery({
		queryKey: ["games", "stats", username, filters],
		queryFn: () => getGamesStats({ data: { username, ...filters } }),
		placeholderData: (prev) => prev,
	});
}
