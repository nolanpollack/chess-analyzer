import { formatEval } from "#/lib/chess-utils";

type EvalBarProps = {
	evalCp: number;
	flipped: boolean;
};

export function EvalBar({ evalCp, flipped }: EvalBarProps) {
	const clamped = Math.max(-800, Math.min(800, evalCp));
	const whitePct = 0.5 + clamped / 1600;
	const label = formatEval(evalCp);

	// The fill div always anchors to the bottom of the bar.
	// Not flipped (white at bottom): light fills from bottom, height = whitePct.
	// Flipped (black at bottom): dark fills from bottom, height = 1 - whitePct.
	const fillPct = flipped ? 1 - whitePct : whitePct;
	const fillClass = flipped ? "bg-eval-bar-dark" : "bg-eval-bar-light";
	// The outer div background is whatever sits at the top.
	const bgClass = flipped ? "bg-eval-bar-light" : "bg-eval-bar-dark";

	// Number goes at the outer edge of the winning side's color section.
	// White winning + not flipped → white at bottom → number at bottom.
	// White winning + flipped     → white at top    → number at top.
	// Black winning + not flipped → black at top    → number at top.
	// Black winning + flipped     → black at bottom → number at bottom.
	// biome-ignore lint/style/useExplicitLengthCheck: != used for XOR logic, not length
	const numberAtBottom = evalCp >= 0 !== flipped;

	// Text color: always contrasts the section the number sits in.
	// White winning → number in light section → dark text.
	// Black winning → number in dark section → light text.
	const textClass = evalCp >= 0 ? "text-eval-bar-dark" : "text-eval-bar-light";

	return (
		<div
			className={`relative h-130 overflow-hidden rounded-xs border border-border-token ${bgClass}`}
		>
			<div
				className={`absolute bottom-0 left-0 right-0 ${fillClass} transition-[height] duration-200 ease-out`}
				style={{ height: `${fillPct * 100}%` }}
			/>
			<div className="absolute left-0 right-0 top-1/2 h-px bg-border-strong" />
			{numberAtBottom ? (
				<div
					className={`absolute bottom-1.5 left-0 right-0 text-center mono-nums font-mono text-3xs ${textClass}`}
				>
					{label}
				</div>
			) : (
				<div
					className={`absolute top-1.5 left-0 right-0 text-center mono-nums font-mono text-3xs ${textClass}`}
				>
					{label}
				</div>
			)}
		</div>
	);
}
