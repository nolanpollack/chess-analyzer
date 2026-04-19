import { useQuery } from "@tanstack/react-query";
import type { GameResultLetter, RecentGame } from "#/features/profile/types";
import { classifyResult } from "#/lib/chess-utils";
import { listGames } from "#/server/games";

type ListGamesResult = Awaited<ReturnType<typeof listGames>>;
type ListGamesOk = Extract<ListGamesResult, { games: unknown }>;
type ListGame = ListGamesOk["games"][number];

export function useRecentGames(username: string, pageSize = 8) {
	return useQuery({
		queryKey: ["recentGames", username, pageSize],
		queryFn: async () => {
			const result = await listGames({
				data: { username, page: 1, pageSize },
			});
			if ("error" in result) throw new Error(result.error);
			return result.games.map(toRecentGame);
		},
	});
}

function toRecentGame(game: ListGame): RecentGame {
	const category = classifyResult(game.resultDetail);
	const result: GameResultLetter =
		category === "win" ? "W" : category === "loss" ? "L" : "D";
	const accuracy =
		game.playerColor === "white" ? game.accuracyWhite : game.accuracyBlack;

	return {
		id: game.id,
		opp: game.opponentUsername,
		oppElo: game.opponentRating,
		result,
		color: game.playerColor,
		score: game.gameScore ?? null,
		acc: accuracy,
		time: game.timeControl,
		opening: game.openingName ?? "—",
		when: formatRelativeTime(game.playedAt),
	};
}

function formatRelativeTime(isoString: string): string {
	const now = Date.now();
	const then = new Date(isoString).getTime();
	const diffMs = now - then;
	const diffMin = Math.floor(diffMs / 60_000);

	if (diffMin < 1) return "just now";
	if (diffMin < 60) return `${diffMin}m ago`;

	const diffHours = Math.floor(diffMin / 60);
	if (diffHours < 24) return `${diffHours}h ago`;

	const diffDays = Math.floor(diffHours / 24);
	if (diffDays === 1) return "Yesterday";
	if (diffDays < 7) return `${diffDays} days ago`;

	const diffWeeks = Math.floor(diffDays / 7);
	if (diffWeeks < 5) return `${diffWeeks}w ago`;

	return new Date(isoString).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}
