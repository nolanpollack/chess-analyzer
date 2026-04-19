import type { MoveClassification } from "#/db/schema";
import type { FlatMove } from "#/features/game/types";

type MoveCellProps = {
	move: FlatMove | null;
	active: boolean;
	onClick: () => void;
};

const SYMBOL: Partial<Record<MoveClassification, string>> = {
	inaccuracy: "?!",
	mistake: "?",
	blunder: "??",
	brilliant: "!!",
};

const TEXT: Record<MoveClassification, string> = {
	brilliant: "text-brilliant",
	best: "text-fg-1",
	good: "text-fg-1",
	inaccuracy: "text-inaccuracy",
	mistake: "text-mistake",
	blunder: "text-blunder",
};

export function MoveCell({ move, active, onClick }: MoveCellProps) {
	if (!move) {
		return (
			<span className="mono-nums font-mono text-[12.5px] text-fg-4">—</span>
		);
	}
	const symbol = SYMBOL[move.classification];
	return (
		<button
			type="button"
			onClick={onClick}
			className={`inline-flex items-center gap-1 rounded-[4px] border px-[6px] py-[2px] mono-nums font-mono text-[12.5px] transition-colors duration-[100ms] ${
				active
					? "border-accent-brand/40 bg-tint-data-6 text-fg-1"
					: `border-transparent bg-transparent ${TEXT[move.classification]} hover:bg-surface-2`
			}`}
		>
			<span>{move.san}</span>
			{symbol && <span className="font-semibold text-[11px]">{symbol}</span>}
		</button>
	);
}
