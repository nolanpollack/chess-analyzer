import { useQueries } from "@tanstack/react-query";
import { BarChart2 } from "lucide-react";
import { DIMENSION_TYPES, type DimensionType } from "#/config/dimensions";
import type { Factor } from "#/features/profile/types";
import { getMaiaTagRatings } from "#/features/ratings/server/maia-queries";
import { maiaTagRatingsToFactors } from "#/features/ratings/utils/to-maia-factor";
import { usePlayerSummary } from "../hooks/use-player-summary";
import { FactorRow } from "./FactorRow";

type FactorBreakdownCardProps = {
	username: string;
	/** When true, append a pulsing "updating" hint to the subtitle. */
	isAnalyzing?: boolean;
};

export function FactorBreakdownCard({
	username,
	isAnalyzing = false,
}: FactorBreakdownCardProps) {
	const { data: summary } = usePlayerSummary(username);
	const playerId = summary?.playerId ?? null;
	const playerRating = summary?.playerRating ?? null;
	const baseline = playerRating ?? 1500;

	const queries = useQueries({
		queries: DIMENSION_TYPES.map((dimensionType: DimensionType) => ({
			queryKey: [
				"maiaTagRatings",
				playerId,
				dimensionType,
				null,
				"trailing_20",
				null,
			] as const,
			queryFn: async () => {
				if (!playerId) return [];
				const result = await getMaiaTagRatings({
					data: { playerId, dimensionType, windowKey: "trailing_20" },
				});
				if ("error" in result) throw new Error(result.error);
				return maiaTagRatingsToFactors(dimensionType, result.ratings, baseline);
			},
			enabled: !!playerId,
		})),
	});

	const isLoading = !playerId || queries.some((q) => q.isLoading);
	const isError = queries.some((q) => q.isError);
	const allFactors: Factor[] = queries.flatMap((q) => q.data ?? []);
	const factors = isLoading ? null : allFactors.length > 0 ? allFactors : null;

	const { weaknesses, strengths } = splitByDelta(factors ?? []);

	return (
		<div className="rounded-lg border border-divider bg-surface p-5">
			<div className="mb-4 flex items-start justify-between">
				<div>
					<div className="text-ui font-medium text-fg-2">
						Performance by factor
					</div>
					<div className="mt-0.5 flex items-center gap-2 text-xs-minus text-fg-3">
						<span>
							{factors !== null && playerRating !== null
								? `Each rating shown relative to your overall rating of ${playerRating}`
								: "Elo-scale ratings across key skill areas"}
						</span>
						{isAnalyzing && (
							<span className="inline-flex items-center gap-1.5 text-2xs text-accent-brand">
								<span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent-brand" />
								Updating
							</span>
						)}
					</div>
				</div>
			</div>
			{factors === null ? (
				<div className="flex min-h-20 items-center justify-center gap-3 py-4">
					<BarChart2 className="h-4 w-4 shrink-0 text-fg-4" />
					<div>
						<div className="text-ui text-fg-3">
							{isLoading
								? "Loading factor breakdown…"
								: isError
									? "Failed to load factors"
									: "No analyzed games yet"}
						</div>
						<div className="mt-0.5 text-xs text-fg-4">
							{isLoading
								? "Computing per-factor Elo ratings"
								: "Sync and analyze a few games to see your strengths and weaknesses"}
						</div>
					</div>
				</div>
			) : (
				<div className="grid grid-cols-2 gap-x-8">
					<FactorColumn
						title="Weaknesses"
						factors={weaknesses}
						baseline={baseline}
					/>
					<FactorColumn
						title="Strengths"
						factors={strengths}
						baseline={baseline}
					/>
				</div>
			)}
		</div>
	);
}

function FactorColumn({
	title,
	factors,
	baseline,
}: {
	title: string;
	factors: Factor[];
	baseline: number;
}) {
	return (
		<div>
			<div className="mb-2 px-3 text-2xs font-medium uppercase tracking-wider text-fg-3">
				{title}
			</div>
			{factors.length === 0 ? (
				<div className="px-3 py-2 text-xs text-fg-4">None yet.</div>
			) : (
				factors.map((factor) => (
					<FactorRow key={factor.id} factor={factor} baseline={baseline} />
				))
			)}
		</div>
	);
}

const MAX_PER_COLUMN = 10;

function splitByDelta(factors: Factor[]): {
	weaknesses: Factor[];
	strengths: Factor[];
} {
	const confident = factors.filter((f) => f.confidence !== "low");
	const weaknesses = confident
		.filter((f) => f.delta < 0)
		.sort((a, b) => a.delta - b.delta)
		.slice(0, MAX_PER_COLUMN);
	const strengths = confident
		.filter((f) => f.delta > 0)
		.sort((a, b) => b.delta - a.delta)
		.slice(0, MAX_PER_COLUMN);
	return { weaknesses, strengths };
}
