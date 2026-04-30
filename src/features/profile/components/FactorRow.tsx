import type { Factor } from "#/features/profile/types";
import { ConfidenceIndicator } from "./ConfidenceIndicator";

type FactorRowProps = {
	factor: Factor;
	baseline: number;
};

export function FactorRow({ factor, baseline }: FactorRowProps) {
	const gap = factor.value - baseline;
	const isNeg = gap < 0;
	const gapPct = Math.min(1, Math.abs(gap) / 400);

	const deltaColorClass =
		factor.delta > 0
			? "text-data-6"
			: factor.delta < 0
				? "text-blunder"
				: "text-fg-3";

	const deltaBgClass =
		factor.delta > 0
			? "bg-tint-data-6"
			: factor.delta < 0
				? "bg-tint-blunder"
				: "bg-surface-2";

	const barRoundingClass = isNeg ? "rounded-l-full" : "rounded-r-full";

	return (
		<div
			className="grid cursor-pointer items-center gap-4 rounded-sm px-3 py-2.5 transition-colors duration-100 hover:bg-surface-2"
			style={{ gridTemplateColumns: "150px 1fr 56px 56px" }}
		>
			<div className="flex items-center gap-2">
				<span className="text-sm-minus text-fg-1" style={{ fontWeight: 450 }}>
					{factor.label}
				</span>
				<ConfidenceIndicator
					confidence={factor.confidence}
					nPositions={factor.nPositions}
				/>
			</div>

			<div className="relative flex h-6 items-center">
				<div className="absolute inset-0 flex items-center">
					<div className="h-px flex-1 bg-divider" />
				</div>
				<div className="absolute top-1 bottom-1 left-1/2 w-px bg-border-strong" />
				<div
					className={`absolute h-1 opacity-90 ${barRoundingClass}`}
					style={{
						left: isNeg ? `${50 - gapPct * 50}%` : "50%",
						width: `${gapPct * 50}%`,
						background: isNeg ? "var(--blunder)" : "var(--data-6)",
					}}
				/>
			</div>

			<div className="mono-nums text-right font-mono text-ui text-fg-1">
				{factor.value}
			</div>

			<div className="text-right">
				<span
					className={`mono-nums inline-flex items-center rounded-sm px-1.5 py-0.5 font-mono text-2xs font-medium ${deltaColorClass} ${deltaBgClass}`}
				>
					{factor.delta > 0 ? `+${factor.delta}` : factor.delta}
				</span>
			</div>
		</div>
	);
}
