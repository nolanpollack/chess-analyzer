import type { FlatMove } from "#/features/game/types";

type EvalGraphCardProps = {
	moves: FlatMove[];
	cursor: number;
	criticalIndex: number;
	onScrub: (index: number) => void;
};

const W = 480;
const H = 64;

export function EvalGraphCard({
	moves,
	cursor,
	criticalIndex,
	onScrub,
}: EvalGraphCardProps) {
	if (moves.length === 0) return null;

	const mid = H / 2;
	const values = moves.map((m) => m.eval_after / 100);
	const maxAbs = Math.max(3, ...values.map((v) => Math.abs(v)));

	const pts = values.map((v, i) => [
		(i / Math.max(1, values.length - 1)) * W,
		mid - (v / maxAbs) * (mid - 4),
	]);

	const areaPath = [
		`M 0 ${mid}`,
		...pts.map((p) => `L ${p[0].toFixed(1)} ${p[1].toFixed(1)}`),
		`L ${W} ${mid} Z`,
	].join(" ");

	const cursorX = (cursor / Math.max(1, values.length - 1)) * W;
	const criticalX =
		criticalIndex >= 0
			? (criticalIndex / Math.max(1, values.length - 1)) * W
			: null;

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
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard navigation handled by useMoveNavigation (←/→) */}
			<svg
				role="img"
				aria-label="Evaluation over time"
				width="100%"
				height={H}
				viewBox={`0 0 ${W} ${H}`}
				preserveAspectRatio="none"
				className="block cursor-pointer"
				onClick={(e) => {
					const rect = e.currentTarget.getBoundingClientRect();
					const x = (e.clientX - rect.left) / rect.width;
					onScrub(
						Math.max(
							0,
							Math.min(values.length - 1, Math.round(x * (values.length - 1))),
						),
					);
				}}
			>
				<line
					x1="0"
					x2={W}
					y1={mid}
					y2={mid}
					stroke="var(--divider-token)"
					strokeWidth="1"
				/>
				<path
					d={areaPath}
					fill="var(--fg)"
					fillOpacity="0.08"
					stroke="var(--fg-2)"
					strokeWidth="1"
				/>
				{criticalX !== null && (
					<line
						x1={criticalX}
						x2={criticalX}
						y1="0"
						y2={H}
						stroke="var(--blunder)"
						strokeWidth="1"
						strokeDasharray="3 3"
						opacity="0.6"
					/>
				)}
				<line
					x1={cursorX}
					x2={cursorX}
					y1="0"
					y2={H}
					stroke="var(--accent-brand)"
					strokeWidth="1.5"
				/>
				<circle cx={cursorX} cy={mid} r="3" fill="var(--accent-brand)" />
			</svg>
		</div>
	);
}
