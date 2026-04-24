import type { GameFactor } from "#/features/game/types";

type FactorBreakdownCardProps = {
	factors: GameFactor[];
	overallElo: number;
};

const MIN_ELO = 400;
const MAX_ELO = 3000;

export function FactorBreakdownCard({
	factors,
	overallElo,
}: FactorBreakdownCardProps) {
	if (factors.length === 0) return null;

	const phaseFactors = factors.filter((f) => f.group === "phase");
	const pieceFactors = factors.filter((f) => f.group === "piece");

	return (
		<div className="rounded-[10px] border border-divider bg-surface">
			<div className="border-b border-divider px-5 py-3.5">
				<div className="text-2xs uppercase tracking-[0.08em] text-fg-3">
					Factor breakdown
				</div>
				<div className="mt-1 text-ui text-fg-2">
					Elo estimate per factor · overall{" "}
					<span className="mono-nums font-mono font-medium text-fg-1">
						{overallElo}
					</span>
				</div>
			</div>
			<div className="px-5 py-4">
				{phaseFactors.length > 0 && (
					<FactorGroup title="Phase" factors={phaseFactors} />
				)}
				{pieceFactors.length > 0 && (
					<div className={phaseFactors.length > 0 ? "mt-5" : ""}>
						<FactorGroup title="Pieces" factors={pieceFactors} />
					</div>
				)}
			</div>
		</div>
	);
}

function FactorGroup({
	title,
	factors,
}: {
	title: string;
	factors: GameFactor[];
}) {
	return (
		<div>
			<div className="mb-2 text-[10.5px] uppercase tracking-[0.08em] text-fg-4">
				{title}
			</div>
			<div className="flex flex-col gap-2.5">
				{factors.map((f) => (
					<FactorRow key={`${f.group}-${f.label}`} factor={f} />
				))}
			</div>
		</div>
	);
}

function FactorRow({ factor }: { factor: GameFactor }) {
	const pct = Math.max(
		0,
		Math.min(100, ((factor.value - MIN_ELO) / (MAX_ELO - MIN_ELO)) * 100),
	);
	const positive = factor.delta >= 0;
	return (
		<div className="flex items-center gap-3">
			<div className="w-[92px] shrink-0 text-ui text-fg-1">
				{factor.label}
				<span className="ml-1 mono-nums font-mono text-[10.5px] text-fg-4">
					{factor.moveCount}
				</span>
			</div>
			<div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
				<div
					className="absolute inset-y-0 left-0 bg-fg-2"
					style={{ width: `${pct}%` }}
				/>
			</div>
			<div className="w-[54px] text-right mono-nums font-mono text-[12.5px] font-medium text-fg-1">
				{factor.value}
			</div>
			<div
				className={`w-[46px] text-right mono-nums font-mono text-2xs ${
					positive ? "text-data-6" : "text-blunder"
				}`}
			>
				{positive ? "+" : ""}
				{factor.delta}
			</div>
		</div>
	);
}
