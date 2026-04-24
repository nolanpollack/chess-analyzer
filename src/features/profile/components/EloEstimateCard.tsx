import { MetricDelta, MetricLabel, MetricValue } from "#/components/ui/metric";
import { usePlayerSummary } from "../hooks/use-player-summary";

type EloEstimateCardProps = {
	username: string;
};

export function EloEstimateCard({ username }: EloEstimateCardProps) {
	const { data: summary, isLoading } = usePlayerSummary(username);
	const elo = summary?.eloEstimate ?? null;
	const delta = summary?.eloDelta30d ?? null;
	const analyzedCount = summary?.analyzedGameCount ?? 0;
	const chessComRating = summary?.currentRating ?? null;
	const chessComGames = summary?.gameCount ?? 0;

	return (
		<div className="flex flex-col justify-between rounded-[10px] border border-divider bg-surface p-7">
			<div>
				<MetricLabel>Elo estimate</MetricLabel>
				<div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-2">
					<MetricValue size="lg">
						<span className="text-[64px]">
							{elo !== null ? elo : isLoading ? "…" : "—"}
						</span>
					</MetricValue>
					{delta !== null && (
						<div className="inline-flex shrink-0 items-center gap-1.5">
							<MetricDelta value={delta} />
							<span className="font-mono text-[11.5px] text-fg-3">30d</span>
						</div>
					)}
				</div>
				<p className="mt-2.5 max-w-[340px] text-[12.5px] leading-[1.5] text-fg-2">
					{analyzedCount > 0
						? `Computed from ${analyzedCount} game${analyzedCount === 1 ? "" : "s"} analyzed across your connected accounts.`
						: "No analyzed games yet."}
				</p>
			</div>

			<div className="mt-8 border-t border-divider pt-5">
				<div className="mb-3 text-2xs uppercase tracking-[0.06em] text-fg-3">
					Imported rating
				</div>
				<ImportedRating rating={chessComRating} games={chessComGames} />
			</div>
		</div>
	);
}

function ImportedRating({
	rating,
	games,
}: {
	rating: number | null;
	games: number;
}) {
	return (
		<div>
			<div className="mb-1 text-xs text-fg-2">Chess.com</div>
			<div className="flex items-baseline gap-2">
				<span className="mono-nums font-mono text-lg font-medium text-fg-1">
					{rating ?? "—"}
				</span>
				<span className="mono-nums font-mono text-2xs text-fg-4">{games}g</span>
			</div>
		</div>
	);
}
