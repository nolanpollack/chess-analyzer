import { useNavigate } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { useRecentGames } from "#/features/games/hooks/use-recent-games";

type Props = { username: string };

export function ReviewLastGameButton({ username }: Props) {
	const navigate = useNavigate();
	const { data: recentGames } = useRecentGames(username);

	const recentGameId = recentGames?.[0]?.id ?? null;

	return (
		<button
			type="button"
			disabled={!recentGameId}
			onClick={() =>
				recentGameId &&
				navigate({
					to: "/$username/games/$gameId",
					params: { username, gameId: recentGameId },
				})
			}
			className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border-none bg-fg px-3 py-1.5 text-ui font-medium text-bg transition-opacity duration-100 hover:opacity-80 active:opacity-60 disabled:cursor-not-allowed disabled:opacity-40"
		>
			<Play className="h-3 w-3" /> Review last game
		</button>
	);
}
