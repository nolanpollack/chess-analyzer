import { ChevronRight, Filter } from "lucide-react";
import { useGameAnalysisStatuses } from "#/features/games/hooks/use-game-analysis-statuses";
import { useRecentGames } from "#/features/games/hooks/use-recent-games";
import { RecentGameRow } from "./RecentGameRow";

type RecentGamesCardProps = {
	username: string;
};

export function RecentGamesCard({ username }: RecentGamesCardProps) {
	const { data: games = [], isLoading } = useRecentGames(username);
	const gameIds = games.map((g) => g.id);
	const { statusById } = useGameAnalysisStatuses(gameIds);

	// A row is "analyzed" iff it has a complete analysis_jobs row. Anything
	// else (missing row, queued, running, failed) counts as not-yet-done.
	const analyzedCount = games.filter(
		(g) => statusById.get(g.id)?.status === "complete",
	).length;
	const pendingCount = games.length - analyzedCount;

	return (
		<div className="overflow-hidden rounded-lg border border-divider bg-surface">
			<div className="flex items-center justify-between border-b border-divider px-5 py-4">
				<div className="flex items-baseline gap-3">
					<div className="text-sm font-medium text-fg">Recent games</div>
					{games.length > 0 && pendingCount > 0 && (
						<div className="text-xs text-fg-3" aria-live="polite">
							Analyzing — {analyzedCount} of {games.length} complete
						</div>
					)}
				</div>
				<div className="flex gap-1.5">
					<button
						type="button"
						className="inline-flex items-center gap-1.5 rounded-sm border-none bg-transparent px-3 py-1.5 text-xs font-medium text-fg-1 transition-all duration-100 hover:bg-surface-2"
					>
						<Filter className="size-3.5" /> Filter
					</button>
					<button
						type="button"
						className="inline-flex items-center gap-1.5 rounded-sm border-none bg-transparent px-3 py-1.5 text-xs font-medium text-fg-1 transition-all duration-100 hover:bg-surface-2"
					>
						View all <ChevronRight className="size-3.5" />
					</button>
				</div>
			</div>
			<table className="w-full border-collapse text-ui">
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
								className={`border-b border-divider py-2.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-fg-3 ${i === 0 ? "pl-5 pr-3 text-left" : i === 6 ? "pl-3 pr-5 text-right" : i >= 4 ? "px-3 text-right" : "px-3 text-left"}`}
							>
								{header}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{isLoading ? (
						<tr>
							<td colSpan={7} className="py-8 text-center text-ui text-fg-3">
								Loading…
							</td>
						</tr>
					) : games.length === 0 ? (
						<tr>
							<td colSpan={7} className="py-8 text-center text-ui text-fg-3">
								No games yet.
							</td>
						</tr>
					) : (
						games.map((game) => {
							const status = statusById.get(game.id);
							// Three cases:
							// 1. Status present → use it directly.
							// 2. No status row + game.acc null → analysis_jobs hasn't been
							//    written yet (worker is queued or just started); synthesize
							//    a pending shimmer so the row doesn't look "done".
							// 3. No status row + game.acc set → legacy complete; render normally.
							const analysis = status
								? {
										status: status.status,
										movesAnalyzed: status.movesAnalyzed,
										totalMoves: status.totalMoves ?? 0,
									}
								: game.acc === null
									? {
											status: "pending" as const,
											movesAnalyzed: 0,
											totalMoves: 0,
										}
									: undefined;
							return (
								<RecentGameRow
									key={game.id}
									game={game}
									username={username}
									analysis={analysis}
								/>
							);
						})
					)}
				</tbody>
			</table>
		</div>
	);
}
