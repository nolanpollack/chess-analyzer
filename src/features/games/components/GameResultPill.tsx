import type { GameResultLetter } from "#/features/games/types";

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
			className={`inline-flex h-5.5 w-5.5 items-center justify-center rounded-xs font-mono text-2xs font-semibold ${bgClass} ${colorClass}`}
		>
			{result}
		</span>
	);
}
