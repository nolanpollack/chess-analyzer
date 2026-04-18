import type { Factor } from "#/features/profile/types";
import { FactorRow } from "./FactorRow";

// TODO(missing-backend): Factor ratings — needs Elo-scale per-factor values + deltas.
// See MISSING_FEATURES.md#factor-ratings
type FactorBreakdownCardProps = {
	factors: Factor[];
	playerElo: number | null;
};

export function FactorBreakdownCard({
	factors,
	playerElo,
}: FactorBreakdownCardProps) {
	const baseline = playerElo ?? 1500;
	const sorted = [...factors].sort(
		(a, b) => a.value - baseline - (b.value - baseline),
	);

	return (
		<div className="rounded-[10px] border border-divider bg-surface p-5">
			<div className="mb-4 flex items-start justify-between">
				<div>
					<div className="text-[13px] font-medium text-fg-2">
						Performance by factor
					</div>
					<div className="mt-[2px] text-[11.5px] text-fg-3">
						{playerElo !== null
							? `Each score shown relative to your overall rating of ${playerElo}. Weakest first.`
							: "Weakest first."}
					</div>
				</div>
				{playerElo !== null && (
					<span className="font-mono text-[11px] text-fg-3">
						baseline {playerElo}
					</span>
				)}
			</div>
			<div className="grid grid-cols-2 gap-x-8">
				{sorted.map((factor) => (
					<FactorRow key={factor.id} factor={factor} baseline={baseline} />
				))}
			</div>
		</div>
	);
}
