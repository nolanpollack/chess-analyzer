import { Info } from "lucide-react";
import { MetricLabel, MetricValue } from "#/components/ui/metric";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip";
import type { Platform } from "#/db/schema";
import type { ImportedSource } from "#/features/profile/server/queries";
import { usePlayerSummary } from "../hooks/use-player-summary";

type PlayerRatingCardProps = {
	username: string;
	/** When true, append a pulsing "updating" hint to the subtitle. */
	isAnalyzing?: boolean;
};

export function PlayerRatingCard({
	username,
	isAnalyzing = false,
}: PlayerRatingCardProps) {
	const { data: summary, isLoading } = usePlayerSummary(username);
	const rating = summary?.playerRating ?? null;
	const sampleSize = summary?.playerRatingSampleSize ?? 0;
	const importedRatings = summary?.importedRatings ?? [];

	return (
		<div className="flex flex-col justify-between rounded-lg border border-divider bg-surface p-7">
			<div>
				<div className="flex items-center gap-1.5">
					<MetricLabel>Player rating</MetricLabel>
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								className="inline-flex cursor-help items-center text-fg-4 transition-colors hover:text-fg-2"
								aria-label="What is player rating?"
							>
								<Info className="size-3" aria-hidden="true" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="top" className="max-w-65">
							An estimate of your skill scaled to Glicko-2 ratings. 
              Computed from analysis of your recent games.
						</TooltipContent>
					</Tooltip>
				</div>
				<div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-2">
					<MetricValue size="lg">
						<span className="text-display">
							{rating !== null ? rating : isLoading ? "…" : "—"}
						</span>
					</MetricValue>
				</div>
				<div className="mt-2.5 flex max-w-85 flex-wrap items-center gap-x-2 gap-y-1 text-xs-plus leading-normal text-fg-2">
					<span>
						{sampleSize > 0
							? `Computed from ${sampleSize} game${sampleSize === 1 ? "" : "s"} analyzed across your connected accounts.`
							: "No analyzed games yet."}
					</span>
					{isAnalyzing && <UpdatingHint />}
				</div>
			</div>

			<div className="mt-8 border-t border-divider pt-5">
				<div className="mb-3 text-2xs uppercase tracking-label text-fg-3">
					{importedRatings.length === 1
						? "Imported rating"
						: "Imported ratings"}
				</div>
				<ImportedRatings sources={importedRatings} />
			</div>
		</div>
	);
}

function UpdatingHint() {
	return (
		<span className="inline-flex items-center gap-1.5 text-2xs text-accent-brand">
			<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent-brand" />
			Updating
		</span>
	);
}

const PLATFORM_LABEL: Record<Platform, string> = {
	"chess.com": "Chess.com",
	lichess: "Lichess",
};

const TIME_CONTROL_LABEL: Record<string, string> = {
	bullet: "Bullet",
	blitz: "Blitz",
	rapid: "Rapid",
	classical: "Classical",
	daily: "Daily",
};

function ImportedRatings({ sources }: { sources: ImportedSource[] }) {
	if (sources.length === 0) {
		return <div className="text-xs text-fg-3">No imported ratings yet.</div>;
	}
	return (
		<div className="grid grid-cols-1 gap-5 md:grid-cols-2">
			{sources.map((source) => (
				<ImportedSourceBlock key={source.platform} source={source} />
			))}
		</div>
	);
}

function ImportedSourceBlock({ source }: { source: ImportedSource }) {
	return (
		<div>
			<div className="mb-2 flex items-center gap-2">
				<span className="text-xs font-medium text-fg-2">
					{PLATFORM_LABEL[source.platform]}
				</span>
				<span className="mono-nums ml-auto font-mono text-2xs-plus text-fg-4">
					{source.totalGames}g total
				</span>
			</div>
			<div className="flex flex-col gap-1">
				{source.formats.map((f) => (
					<div
						key={f.timeControlClass}
						className="grid items-baseline gap-2"
						style={{ gridTemplateColumns: "60px 1fr auto" }}
					>
						<span className="text-xs-minus text-fg-3">
							{TIME_CONTROL_LABEL[f.timeControlClass] ?? f.timeControlClass}
						</span>
						<span className="mono-nums font-mono text-sm font-medium text-fg-1">
							{f.rating}
						</span>
						<span className="mono-nums font-mono text-2xs-plus text-fg-4">
							{f.games}g
						</span>
					</div>
				))}
			</div>
		</div>
	);
}
