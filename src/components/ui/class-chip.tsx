import type { MoveClassification } from "#/db/schema";

type ClassChipProps = {
	cls: "blunder" | "mistake" | "inaccuracy";
	count: number;
};

const LABEL: Record<ClassChipProps["cls"], string> = {
	blunder: "Blunders",
	mistake: "Mistakes",
	inaccuracy: "Inaccuracies",
};

const SYMBOL: Record<ClassChipProps["cls"], string> = {
	blunder: "??",
	mistake: "?",
	inaccuracy: "?!",
};

const ACTIVE: Record<MoveClassification, string> = {
	blunder: "text-blunder border-blunder/30 bg-tint-blunder",
	mistake: "text-mistake border-mistake/30 bg-mistake/10",
	miss: "text-mistake border-mistake/30 bg-mistake/10",
	inaccuracy: "text-inaccuracy border-inaccuracy/30 bg-inaccuracy/10",
	brilliant: "",
	great: "",
	best: "",
	excellent: "",
	good: "",
};

export function ClassChip({ cls, count }: ClassChipProps) {
	const active = count > 0;
	return (
		<span
			className={`inline-flex items-center gap-1 rounded-[4px] border px-2 py-0.5 text-[10.5px] font-medium ${
				active ? ACTIVE[cls] : "border-divider bg-surface-2 text-fg-3"
			}`}
		>
			<span className="mono-nums font-mono font-semibold">{SYMBOL[cls]}</span>
			<span className="mono-nums font-mono">{count}</span>
			<span>{LABEL[cls]}</span>
		</span>
	);
}
