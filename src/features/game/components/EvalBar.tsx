type EvalBarProps = {
	evalCp: number;
	flipped: boolean;
};

export function EvalBar({ evalCp, flipped }: EvalBarProps) {
	const evalPawns = evalCp / 100;
	const clamped = Math.max(-8, Math.min(8, evalPawns));
	const whitePct = 0.5 + clamped / 16;
	// When flipped, black is on top. The "white portion" still represents white's advantage
	// but rendered from the bottom up.
	const lightHeightPct = flipped ? 1 - whitePct : whitePct;

	return (
		<div className="relative h-130 overflow-hidden rounded-xs border border-border-token bg-eval-bar-dark">
			<div
				className="absolute left-0 right-0 top-0 bg-eval-bar-light transition-[height] duration-200 ease-out"
				style={{ height: `${lightHeightPct * 100}%` }}
			/>
			<div className="absolute left-0 right-0 top-1/2 h-px bg-border-strong" />
			<div className="absolute bottom-1.5 left-0 right-0 text-center mono-nums font-mono text-3xs text-eval-bar-light">
				{evalPawns > 0 ? "+" : ""}
				{evalPawns.toFixed(1)}
			</div>
		</div>
	);
}
