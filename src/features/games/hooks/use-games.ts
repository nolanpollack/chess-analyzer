import {
	keepPreviousData,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import type { GameFilters } from "#/features/games/types";
import { listGames } from "#/server/games";

type UseGamesOptions = GameFilters & {
	username: string;
	enabled?: boolean;
};

export function useGames({
	username,
	page,
	timeControlClass,
	result,
	playerColor,
	enabled = true,
}: UseGamesOptions) {
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: ["games", username, page, timeControlClass, result, playerColor],
		queryFn: () =>
			listGames({
				data: {
					username,
					page,
					pageSize: 20,
					timeControlClass,
					result,
					playerColor,
				},
			}),
		enabled,
		placeholderData: keepPreviousData,
	});

	// Prefetch the next page so navigation feels instant
	useEffect(() => {
		if (!query.data || !enabled) return;
		const totalPages = Math.ceil(query.data.totalCount / query.data.pageSize);
		if (page >= totalPages) return;
		void queryClient.prefetchQuery({
			queryKey: [
				"games",
				username,
				page + 1,
				timeControlClass,
				result,
				playerColor,
			],
			queryFn: () =>
				listGames({
					data: {
						username,
						page: page + 1,
						pageSize: 20,
						timeControlClass,
						result,
						playerColor,
					},
				}),
		});
	}, [
		query.data,
		queryClient,
		username,
		page,
		timeControlClass,
		result,
		playerColor,
		enabled,
	]);

	return query;
}
