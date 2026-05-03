import { AreaChart } from "#/components/charts/AreaChart";
import type { FlatMove } from "#/features/game/types";
import { formatEval } from "#/lib/chess-utils";

type EvalGraphCardProps = {
	moves: FlatMove[];
	cursor: number;
	onScrub: (index: number) => void;
};

const EVAL_CLAMP = 8;

export function EvalGraphCard({ moves, cursor, onScrub }: EvalGraphCardProps) {
	if (moves.length === 0) return null;

	const data = moves.map((m, i) => ({
		index: i,
		value: Math.max(-EVAL_CLAMP, Math.min(EVAL_CLAMP, m.eval_after / 100)),
	}));

	return (
		<div className="mt-4 rounded-md border border-divider bg-surface px-3.5 py-3">
			<div className="mb-1.5 flex items-center justify-between">
				<span className="text-xs-minus uppercase tracking-label text-fg-3">
					Evaluation over time
				</span>
				<span className="mono-nums font-mono text-2xs-plus text-fg-4">
					white advantage ↑
				</span>
			</div>
			<AreaChart
				data={data}
				color="var(--fg-2)"
				className="h-16"
				yDomain={[-EVAL_CLAMP, EVAL_CLAMP]}
				midline
				cursorX={cursor}
				onClickIndex={onScrub}
				showTooltip
				tooltipValueFormatter={(v) => {
					const cp = Math.round(v * 100);
					return `${cp >= 0 ? "+" : ""}${formatEval(cp)}`;
				}}
			/>
		</div>
	);
}
