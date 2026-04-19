import type { MoveClassification } from "#/db/schema";

type Size = "sm" | "md" | "lg";

type MoveBadgeProps = {
	cls: MoveClassification;
	size?: Size;
};

const LABEL: Record<MoveClassification, string> = {
	brilliant: "Brilliant",
	best: "Best",
	good: "Good",
	inaccuracy: "Inaccuracy",
	mistake: "Mistake",
	blunder: "Blunder",
};

const SYMBOL: Record<MoveClassification, string> = {
	brilliant: "!!",
	best: "✓",
	good: "✓",
	inaccuracy: "?!",
	mistake: "?",
	blunder: "??",
};

const TEXT_CLASS: Record<MoveClassification, string> = {
	brilliant: "text-brilliant",
	best: "text-best",
	good: "text-good",
	inaccuracy: "text-inaccuracy",
	mistake: "text-mistake",
	blunder: "text-blunder",
};

const SIZE_CLASS: Record<Size, string> = {
	sm: "px-[6px] py-[1px] text-[10px]",
	md: "px-[7px] py-[2px] text-[11px]",
	lg: "px-[9px] py-[3px] text-[12px]",
};

export function MoveBadge({ cls, size = "md" }: MoveBadgeProps) {
	return (
		<span
			className={`inline-flex items-center gap-[5px] rounded-[4px] border border-divider bg-surface-2 font-medium mono-nums font-mono ${SIZE_CLASS[size]} ${TEXT_CLASS[cls]}`}
		>
			<span className="font-semibold">{SYMBOL[cls]}</span>
			<span>{LABEL[cls]}</span>
		</span>
	);
}
