import { useQuery } from "@tanstack/react-query";
import { listGames } from "#/features/games/server/queries";
import type {
	Game,
	GameResultLetter,
	GameSummary,
} from "#/features/games/types";
import { classifyResult } from "#/lib/chess-utils";
import { formatRelativeTime } from "#/lib/date";

export function useRecentGames(username: string, pageSize = 8) {
	return useQuery({
		queryKey: ["games", "recent", username, pageSize],
		queryFn: async () => {
			const result = await listGames({
				data: { username, page: 1, pageSize },
			});
			return result.items.map(toSummary);
		},
	});
}

function toSummary(game: Game): GameSummary {
	const category = classifyResult(game.resultDetail);
	const result: GameResultLetter =
		category === "win" ? "W" : category === "loss" ? "L" : "D";
	const chessComAccuracy =
		game.playerColor === "white" ? game.accuracyWhite : game.accuracyBlack;
	const accuracy = game.overallAccuracy ?? chessComAccuracy;

	return {
		id: game.id,
		opp: game.opponentUsername,
		oppElo: game.opponentRating,
		result,
		color: game.playerColor,
		score: game.gameScore,
		acc: accuracy,
		time: game.timeControl,
		opening: game.openingName ?? "—",
		when: formatRelativeTime(game.playedAt),
	};
}
