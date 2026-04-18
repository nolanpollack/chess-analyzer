import type { GameResultLetter } from "#/features/profile/types";

type GameResultPillProps = {
	result: GameResultLetter;
};

const RESULT_CLASSES: Record<
	GameResultLetter,
	{ bgClass: string; colorClass: string }
> = {
	W: { bgClass: "bg-result-win", colorClass: "text-data-6" },
	L: { bgClass: "bg-result-loss", colorClass: "text-blunder" },
	D: { bgClass: "bg-surface-2", colorClass: "text-fg-2" },
};

export function GameResultPill({ result }: GameResultPillProps) {
	const { bgClass, colorClass } = RESULT_CLASSES[result];

	return (
		<span
			className={`inline-flex h-[22px] w-[22px] items-center justify-center rounded-[4px] font-mono text-[11px] font-semibold ${bgClass} ${colorClass}`}
		>
			{result}
		</span>
	);
}
