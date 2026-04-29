import { useQuery } from "@tanstack/react-query";
import { listGames } from "#/features/games/server/queries";
import type {
	Game,
	GameResultLetter,
	GameSummary,
} from "#/features/games/types";
import { classifyResult } from "#/lib/chess-utils";
import { formatRelativeTime } from "#/lib/date";

export type GamesQueryFilters = {
	timeControlClass?: "bullet" | "blitz" | "rapid" | "classical" | "daily";
	result?: "win" | "loss" | "draw";
	playerColor?: "white" | "black";
	openingQuery?: string;
};

export type GamesSort = {
	key: "date" | "opponent" | "opening" | "accuracy" | "score";
	dir: "asc" | "desc";
};

type UseGamesArgs = {
	username: string;
	filters: GamesQueryFilters;
	sort: GamesSort;
	page: number;
	pageSize: number;
};

export function useGames({
	username,
	filters,
	sort,
	page,
	pageSize,
}: UseGamesArgs) {
	return useQuery({
		queryKey: ["games", "list", username, filters, sort, page, pageSize],
		queryFn: async () => {
			const result = await listGames({
				data: {
					username,
					page,
					pageSize,
					sortKey: sort.key,
					sortDir: sort.dir,
					...filters,
				},
			});
			return {
				items: result.items.map(toSummary),
				rawItems: result.items,
				totalCount: result.totalCount,
			};
		},
		placeholderData: (prev) => prev,
	});
}

function toSummary(game: Game): GameSummary {
	const category = classifyResult(game.resultDetail);
	const result: GameResultLetter =
		category === "win" ? "W" : category === "loss" ? "L" : "D";
	return {
		id: game.id,
		opp: game.opponentUsername,
		oppElo: game.opponentRating,
		result,
		color: game.playerColor,
		score: game.gameScore,
		acc: game.overallAccuracy,
		time: game.timeControl,
		opening: game.openingName ?? "—",
		when: formatRelativeTime(game.playedAt),
	};
}
