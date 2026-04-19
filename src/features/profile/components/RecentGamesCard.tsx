import { ChevronRight, Filter } from "lucide-react";
import { useRecentGames } from "#/features/profile/hooks/use-recent-games";
import { RecentGameRow } from "./RecentGameRow";

type RecentGamesCardProps = {
	username: string;
};

export function RecentGamesCard({ username }: RecentGamesCardProps) {
	const { data: games = [], isLoading } = useRecentGames(username);

	return (
		<div className="overflow-hidden rounded-[10px] border border-divider bg-surface">
			<div className="flex items-center justify-between border-b border-divider px-5 py-4">
				<div className="text-[14px] font-medium text-fg">Recent games</div>
				<div className="flex gap-[6px]">
					<button
						type="button"
						className="inline-flex items-center gap-[6px] rounded-[6px] border-none bg-transparent px-3 py-[6px] text-[12px] font-medium text-fg-1 transition-all duration-[120ms] hover:bg-surface-2"
					>
						<Filter className="h-[13px] w-[13px]" /> Filter
					</button>
					<button
						type="button"
						className="inline-flex items-center gap-[6px] rounded-[6px] border-none bg-transparent px-3 py-[6px] text-[12px] font-medium text-fg-1 transition-all duration-[120ms] hover:bg-surface-2"
					>
						View all <ChevronRight className="h-[13px] w-[13px]" />
					</button>
				</div>
			</div>
			<table className="w-full border-collapse text-[13px]">
				<thead>
					<tr>
						{[
							"Result",
							"Opponent",
							"Opening",
							"Time",
							"Accuracy",
							"Game score",
							"Played",
						].map((header, i) => (
							<th
								key={header}
								className={`border-b border-divider py-[10px] text-[11.5px] font-medium uppercase tracking-[0.06em] text-fg-3 ${i === 0 ? "pl-5 pr-3 text-left" : i === 6 ? "pl-3 pr-5 text-right" : i >= 4 ? "px-3 text-right" : "px-3 text-left"}`}
							>
								{header}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{isLoading ? (
						<tr>
							<td
								colSpan={7}
								className="py-8 text-center text-[13px] text-fg-3"
							>
								Loading…
							</td>
						</tr>
					) : games.length === 0 ? (
						<tr>
							<td
								colSpan={7}
								className="py-8 text-center text-[13px] text-fg-3"
							>
								No games yet.
							</td>
						</tr>
					) : (
						games.map((game) => (
							<RecentGameRow key={game.id} game={game} username={username} />
						))
					)}
				</tbody>
			</table>
		</div>
	);
}
