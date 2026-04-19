import { useNavigate } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { useRecentGame } from "#/features/profile/hooks/use-recent-game";

type Props = { username: string };

export function ReviewLastGameButton({ username }: Props) {
	const navigate = useNavigate();
	const { data: recentGameId } = useRecentGame(username);

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
			className="inline-flex cursor-pointer items-center gap-[6px] rounded-[6px] border-none bg-fg px-3 py-[6px] text-[13px] font-medium text-bg transition-opacity duration-[120ms] hover:opacity-80 active:opacity-60 disabled:cursor-not-allowed disabled:opacity-40"
		>
			<Play className="h-3 w-3" /> Review last game
		</button>
	);
}
