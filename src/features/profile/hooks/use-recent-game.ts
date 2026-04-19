import { useQuery } from "@tanstack/react-query";
import { listGames } from "#/server/games";

export function useRecentGame(username: string) {
	return useQuery({
		queryKey: ["recentGame", username],
		queryFn: async () => {
			const result = await listGames({
				data: { username, page: 1, pageSize: 1 },
			});
			if ("error" in result) throw new Error(result.error);
			return result.games[0]?.id ?? null;
		},
	});
}
