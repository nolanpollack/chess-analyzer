import type { MoveClassification } from "#/db/schema";

type Size = "sm" | "md" | "lg";

type MoveBadgeProps = {
	cls: MoveClassification;
	size?: Size;
};

const LABEL: Record<MoveClassification, string> = {
	brilliant: "Brilliant",
	great: "Great",
	best: "Best",
	excellent: "Excellent",
	good: "Good",
	inaccuracy: "Inaccuracy",
	mistake: "Mistake",
	blunder: "Blunder",
	miss: "Miss",
};

const SYMBOL: Record<MoveClassification, string> = {
	brilliant: "!!",
	great: "!",
	best: "✓",
	excellent: "!",
	good: "✓",
	inaccuracy: "?!",
	mistake: "?",
	blunder: "??",
	miss: "□",
};

const TEXT_CLASS: Record<MoveClassification, string> = {
	brilliant: "text-brilliant",
	great: "text-brilliant",
	best: "text-best",
	excellent: "text-best",
	good: "text-good",
	inaccuracy: "text-inaccuracy",
	mistake: "text-mistake",
	blunder: "text-blunder",
	miss: "text-mistake",
};

const SIZE_CLASS: Record<Size, string> = {
	sm: "px-1.5 py-px text-[10px]",
	md: "px-2 py-0.5 text-2xs",
	lg: "px-2.5 py-0.5 text-xs",
};

export function MoveBadge({ cls, size = "md" }: MoveBadgeProps) {
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-[4px] border border-divider bg-surface-2 font-medium mono-nums font-mono ${SIZE_CLASS[size]} ${TEXT_CLASS[cls]}`}
		>
			<span className="font-semibold">{SYMBOL[cls]}</span>
			<span>{LABEL[cls]}</span>
		</span>
	);
}
