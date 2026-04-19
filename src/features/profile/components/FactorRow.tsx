import type { Factor } from "#/features/profile/types";

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

	return (
		<div className="grid cursor-pointer items-center gap-4 rounded-sm px-3 py-2.5 transition-colors duration-100 hover:bg-surface-2 grid-cols-[160px_1fr_60px_70px]">
			{/* Label */}
			<div className="flex items-center gap-2">
				<span className="text-[13.5px] font-[450] text-fg-1">
					{factor.label}
				</span>
				{factor.confidence === "medium" && (
					<span
						className="h-[5px] w-[5px] rounded-full bg-fg-4"
						title="Medium confidence"
					/>
				)}
			</div>

			{/* Gap bar */}
			<div className="relative flex h-[22px] items-center">
				<div className="absolute inset-0 flex items-center">
					<div className="h-px flex-1 bg-divider" />
				</div>
				<div className="absolute left-1/2 top-1 bottom-1 w-px bg-border-strong" />
				<div
					className="absolute rounded-full opacity-75"
					style={{
						left: isNeg ? `${50 - gapPct * 50}%` : "50%",
						width: `${gapPct * 50}%`,
						top: 9,
						bottom: 9,
						background: isNeg ? "var(--blunder)" : "var(--data-6)",
					}}
				/>
			</div>

			{/* Value */}
			<div className="mono-nums text-right font-mono text-[13px] text-fg-1">
				{factor.value}
			</div>

			{/* Delta */}
			<div className="text-right">
				<span
					className={`mono-nums inline-flex items-center rounded-[4px] px-1.5 py-0.5 font-mono text-[11px] font-medium ${deltaColorClass} ${deltaBgClass}`}
				>
					{factor.delta > 0 ? `+${factor.delta}` : factor.delta}
				</span>
			</div>
		</div>
	);
}
