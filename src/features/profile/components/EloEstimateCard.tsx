import { MetricDelta, MetricLabel, MetricValue } from "#/components/ui/metric";
import type { PlayerSummary } from "#/features/profile/types";

type EloEstimateCardProps = {
	summary: PlayerSummary | undefined;
	isLoading: boolean;
};

export function EloEstimateCard({ summary, isLoading }: EloEstimateCardProps) {
	const elo = summary?.eloEstimate ?? null;
	const delta = summary?.eloDelta30d ?? null;
	const analyzedCount = summary?.analyzedGameCount ?? 0;
	const chessComRating = summary?.currentRating ?? null;
	const chessComGames = summary?.gameCount ?? 0;

	return (
		<div className="flex flex-col justify-between rounded-[10px] border border-divider bg-surface p-7">
			<div>
				<MetricLabel>Elo estimate</MetricLabel>
				<div className="mt-[10px] flex flex-wrap items-baseline gap-x-3 gap-y-2">
					<MetricValue size="lg">
						<span style={{ fontSize: 64 }}>
							{elo !== null ? elo : isLoading ? "…" : "—"}
						</span>
					</MetricValue>
					{delta !== null && (
						<div className="inline-flex shrink-0 items-center gap-[6px]">
							<MetricDelta value={delta} />
							<span className="font-mono text-[11.5px] text-fg-3">30d</span>
						</div>
					)}
				</div>
				<p className="mt-[10px] max-w-[340px] text-[12.5px] leading-[1.5] text-fg-2">
					{analyzedCount > 0
						? `Based on your chess.com rating across ${analyzedCount} analyzed game${analyzedCount === 1 ? "" : "s"}.`
						: "No analyzed games yet."}
					{/* TODO(missing-backend): Replace chess.com rating with a unified cross-platform
					    Elo estimate. See MISSING_FEATURES.md#elo-estimate */}
				</p>
			</div>

			<div className="mt-8 border-t border-divider pt-5">
				<div className="mb-3 text-[11px] uppercase tracking-[0.06em] text-fg-3">
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
			<div className="mb-1 text-[12px] text-fg-2">Chess.com</div>
			<div className="flex items-baseline gap-2">
				<span className="mono-nums font-mono text-[18px] font-medium text-fg-1">
					{rating ?? "—"}
				</span>
				<span className="mono-nums font-mono text-[11px] text-fg-4">
					{games}g
				</span>
			</div>
		</div>
	);
}
