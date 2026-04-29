import type { GamesQueryFilters } from "#/features/games/hooks/use-games";
import { useGamesStats } from "#/features/games/hooks/use-games-stats";
import { usePlayerSummary } from "#/features/profile/hooks/use-player-summary";

type GamesStatsPanelProps = {
	username: string;
	filters: GamesQueryFilters;
	hasActiveFilters: boolean;
};

export function GamesStatsPanel({
	username,
	filters,
	hasActiveFilters,
}: GamesStatsPanelProps) {
	const { data: stats, isLoading } = useGamesStats({ username, filters });
	const { data: summary } = usePlayerSummary(username);
	const overallElo = summary?.eloEstimate ?? null;

	if (isLoading && !stats) {
		return (
			<div className="h-[88px] rounded-lg border border-divider bg-surface" />
		);
	}
	if (!stats || stats.totalCount === 0) return null;

	const winPct = Math.round((stats.wins / stats.totalCount) * 100);
	const vsOverall =
		overallElo != null && stats.avgGameScore != null
			? stats.avgGameScore - overallElo
			: null;
	const blundersPerGame = (stats.blunderCount / stats.totalCount).toFixed(2);

	return (
		<div className="grid grid-cols-5 overflow-hidden rounded-lg border border-divider bg-surface">
			<StatCell
				label="Showing"
				value={stats.totalCount.toLocaleString()}
				sub={hasActiveFilters ? "matching filters" : "all games"}
			/>
			<StatCell
				label="Record"
				value={
					<span>
						<span className="text-data-6">{stats.wins}</span>
						<span className="mx-1 text-fg-4">·</span>
						<span className="text-fg-3">{stats.draws}</span>
						<span className="mx-1 text-fg-4">·</span>
						<span className="text-blunder">{stats.losses}</span>
					</span>
				}
				sub={`${winPct}% win rate`}
			/>
			<StatCell
				label="Avg accuracy"
				value={
					stats.avgAccuracy != null ? `${stats.avgAccuracy.toFixed(1)}%` : "—"
				}
				sub="across set"
			/>
			<StatCell
				label="Avg game score"
				value={stats.avgGameScore ?? "—"}
				sub={
					vsOverall != null ? (
						<span className={vsOverall < 0 ? "text-blunder" : "text-data-6"}>
							{vsOverall > 0 ? "+" : ""}
							{vsOverall} vs overall
						</span>
					) : (
						""
					)
				}
			/>
			<StatCell
				label="Blunders"
				value={stats.blunderCount.toLocaleString()}
				sub={`${blundersPerGame} / game`}
				last
			/>
		</div>
	);
}

function StatCell({
	label,
	value,
	sub,
	last,
}: {
	label: string;
	value: React.ReactNode;
	sub: React.ReactNode;
	last?: boolean;
}) {
	return (
		<div className={`px-5 py-4 ${last ? "" : "border-r border-divider"}`}>
			<div className="mb-1.5 text-2xs uppercase tracking-[0.06em] text-fg-3">
				{label}
			</div>
			<div className="mono-nums font-mono text-[22px] font-medium leading-[1.1] text-fg">
				{value}
			</div>
			<div className="mt-1 text-2xs text-fg-3">{sub}</div>
		</div>
	);
}
