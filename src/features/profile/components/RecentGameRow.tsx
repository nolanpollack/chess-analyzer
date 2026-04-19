import { useNavigate } from "@tanstack/react-router";
import type { RecentGame } from "#/features/profile/types";
import { GameResultPill } from "./GameResultPill";
import { GameScoreCell } from "./GameScoreCell";

type RecentGameRowProps = {
	game: RecentGame;
	username: string;
};

export function RecentGameRow({ game, username }: RecentGameRowProps) {
	const navigate = useNavigate();
	return (
		<tr
			onClick={() =>
				navigate({
					to: "/$username/games/$gameId",
					params: { username, gameId: game.id },
				})
			}
			className="cursor-pointer transition-colors duration-100 hover:bg-surface-2"
		>
			<td className="py-3.5 pl-5 pr-3">
				<GameResultPill result={game.result} />
			</td>
			<td className="px-3 py-3.5">
				<div className="flex items-center gap-2">
					<span
						className={`h-2 w-2 shrink-0 rounded-[2px] border border-border-strong ${game.color === "white" ? "bg-surface-3" : "bg-fg-1"}`}
					/>
					<span className="text-[13px] font-medium text-fg-1">{game.opp}</span>
					<span className="mono-nums font-mono text-xs text-fg-3">
						{game.oppElo}
					</span>
				</div>
			</td>
			<td className="px-3 py-3.5 text-[13px] text-fg-2">{game.opening}</td>
			<td className="px-3 py-3.5">
				<span className="mono-nums font-mono text-xs text-fg-2">
					{game.time}
				</span>
			</td>
			<td className="px-3 py-3.5 text-right">
				<span className="mono-nums font-mono text-[13px]">
					{game.acc !== null ? `${game.acc.toFixed(1)}%` : "—"}
				</span>
			</td>
			<td className="px-3 py-3.5 text-right">
				<GameScoreCell score={game.score} />
			</td>
			<td className="py-3.5 pl-3 pr-5 text-right text-xs text-fg-3">
				{game.when}
			</td>
		</tr>
	);
}
