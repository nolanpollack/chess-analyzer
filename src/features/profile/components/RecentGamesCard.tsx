import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip";
import type { AnalysisProgress } from "#/features/games/components/GameTableRow";
import { GameTableRow } from "#/features/games/components/GameTableRow";
import { useGameAnalysisStatuses } from "#/features/games/hooks/use-game-analysis-statuses";
import { useRecentGames } from "#/features/games/hooks/use-recent-games";
import type { GameAnalysisStatus } from "#/features/games/server/analysis-queries";
import { usePlayerSummary } from "#/features/profile/hooks/use-player-summary";

type RecentGamesCardProps = {
	username: string;
	isActive?: boolean;
};

type ColumnHeader = {
	label: string;
	tooltip?: string;
	align: "left" | "right";
};

const HEADERS: ColumnHeader[] = [
	{ label: "Result", align: "left" },
	{ label: "Opponent", align: "left" },
	{ label: "Opening", align: "left" },
	{ label: "Time", align: "left" },
	{
		label: "Accuracy",
		tooltip: "How precisely you played, move by move.",
		align: "right",
	},
	{
		label: "Game rating",
		tooltip: "An estimate of how well you played overall.",
		align: "right",
	},
	{ label: "Played", align: "right" },
];

export function RecentGamesCard({ username, isActive }: RecentGamesCardProps) {
	const { data: games = [], isLoading } = useRecentGames(username, 8, isActive);
	const { data: summary } = usePlayerSummary(username);
	const playerRating = summary?.playerRating ?? null;
	const gameIds = games.map((g) => g.id);
	const { statusById } = useGameAnalysisStatuses(gameIds);

	return (
		<div className="overflow-hidden rounded-lg border border-divider bg-surface">
			<div className="flex items-center justify-between border-b border-divider px-5 py-4">
				<div className="text-sm font-medium text-fg">Recent games</div>
				<Link
					to="/$username/games"
					params={{ username }}
					className="inline-flex items-center gap-1.5 rounded-sm bg-transparent px-3 py-1.5 text-xs font-medium text-fg-1 transition-all duration-100 hover:bg-surface-2"
				>
					View all <ChevronRight className="size-3.5" />
				</Link>
			</div>
			<table className="w-full border-collapse text-ui">
				<thead>
					<tr>
						{HEADERS.map((header, i) => (
							<HeaderCell
								key={header.label}
								header={header}
								isFirst={i === 0}
								isLast={i === HEADERS.length - 1}
							/>
						))}
					</tr>
				</thead>
				<tbody>
					{isLoading ? (
						<tr>
							<td
								colSpan={HEADERS.length}
								className="py-8 text-center text-ui text-fg-3"
							>
								Loading…
							</td>
						</tr>
					) : games.length === 0 ? (
						<tr>
							<td
								colSpan={HEADERS.length}
								className="py-8 text-center text-ui text-fg-3"
							>
								No games yet.
							</td>
						</tr>
					) : (
						games.map((game) => (
							<GameTableRow
								key={game.id}
								game={game}
								username={username}
								analysis={resolveAnalysisProgress(
									statusById.get(game.id),
									game.acc,
								)}
								playerRating={playerRating}
							/>
						))
					)}
				</tbody>
			</table>
		</div>
	);
}

function HeaderCell({
	header,
	isFirst,
	isLast,
}: {
	header: ColumnHeader;
	isFirst: boolean;
	isLast: boolean;
}) {
	const padding = isFirst ? "pl-5 pr-3" : isLast ? "pl-3 pr-5" : "px-3";
	const align = header.align === "right" ? "text-right" : "text-left";
	return (
		<th
			className={`border-b border-divider py-2.5 text-xs-minus font-medium uppercase tracking-label text-fg-3 ${padding} ${align}`}
		>
			{header.tooltip ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="cursor-help">{header.label}</span>
					</TooltipTrigger>
					<TooltipContent
						side="top"
						className="max-w-65 normal-case tracking-normal"
					>
						{header.tooltip}
					</TooltipContent>
				</Tooltip>
			) : (
				header.label
			)}
		</th>
	);
}

/**
 * Three cases:
 * 1. Status present → use it directly.
 * 2. No status row + acc null → analysis_jobs hasn't been written yet
 *    (worker is queued or just started); synthesize a pending shimmer.
 * 3. No status row + acc set → legacy complete; render without progress.
 */
function resolveAnalysisProgress(
	status: GameAnalysisStatus | undefined,
	acc: number | null,
): AnalysisProgress | undefined {
	if (status) {
		return {
			status: status.status,
			movesAnalyzed: status.movesAnalyzed,
			totalMoves: status.totalMoves ?? 0,
			accuracyReady: status.accuracyReady,
			gameRatingReady: status.gameRatingReady,
		};
	}
	if (acc === null) {
		return {
			status: "pending",
			movesAnalyzed: 0,
			totalMoves: 0,
			accuracyReady: false,
			gameRatingReady: false,
		};
	}
	return undefined;
}
