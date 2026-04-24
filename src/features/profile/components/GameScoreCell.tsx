// TODO(missing-backend): Per-game Elo-scale score. Today we only store accuracy %.
// See MISSING_FEATURES.md#game-score

type GameScoreCellProps = {
	score: number | null;
};

function getScoreColorClass(score: number): string {
	if (score >= 1600) return "bg-data-6";
	if (score >= 1500) return "bg-data-3";
	return "bg-blunder";
}

export function GameScoreCell({ score }: GameScoreCellProps) {
	if (score === null) {
		return <span className="mono-nums font-mono text-ui text-fg-4">—</span>;
	}

	const fillPct = Math.min(100, Math.max(0, ((score - 1200) / 800) * 100));
	const colorClass = getScoreColorClass(score);

	return (
		<div className="inline-flex items-center gap-2">
			<span className="mono-nums font-mono text-ui text-fg">{score}</span>
			<span className="relative h-1 w-10 rounded-[2px] bg-surface-2">
				<span
					className={`absolute bottom-0 left-0 top-0 rounded-[2px] ${colorClass}`}
					style={{ width: `${fillPct}%` }}
				/>
			</span>
		</div>
	);
}
