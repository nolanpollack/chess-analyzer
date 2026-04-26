import { BarChart2 } from "lucide-react";
import { useDimensionRatings } from "#/features/ratings/hooks/use-dimension-ratings";
import { usePlayerSummary } from "../hooks/use-player-summary";
import { FactorRow } from "./FactorRow";

type FactorBreakdownCardProps = {
	username: string;
};

export function FactorBreakdownCard({ username }: FactorBreakdownCardProps) {
	const { data: summary } = usePlayerSummary(username);
	const {
		factors: allFactors,
		isLoading,
		isError,
	} = useDimensionRatings(username);
	console.log("[FactorBreakdownCard]", {
		username,
		isLoading,
		isError,
		factorCount: allFactors.length,
		first: allFactors[0],
	});
	const factors = isLoading ? null : allFactors.length > 0 ? allFactors : null;
	const playerElo = summary?.eloEstimate ?? null;
	const baseline = playerElo ?? 1500;

	return (
		<div className="rounded-[10px] border border-divider bg-surface p-5">
			<div className="mb-4 flex items-start justify-between">
				<div>
					<div className="text-ui font-medium text-fg-2">
						Performance by factor
					</div>
					<div className="mt-0.5 text-[11.5px] text-fg-3">
						{factors !== null
							? playerElo !== null
								? `Each score shown relative to your overall rating of ${playerElo}. Weakest first.`
								: "Weakest first."
							: "Elo-scale ratings across key skill areas"}
					</div>
				</div>
				{factors !== null && playerElo !== null && (
					<span className="font-mono text-2xs text-fg-3">
						baseline {playerElo}
					</span>
				)}
			</div>
			{factors === null ? (
				<div className="flex min-h-20 items-center justify-center gap-3 py-4">
					<BarChart2 className="h-4 w-4 shrink-0 text-fg-4" />
					<div>
						<div className="text-ui text-fg-3">
							{isLoading
								? "Loading factor breakdown…"
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
					{[...factors]
						.sort((a, b) => a.value - baseline - (b.value - baseline))
						.map((factor) => (
							<FactorRow key={factor.id} factor={factor} baseline={baseline} />
						))}
				</div>
			)}
		</div>
	);
}
