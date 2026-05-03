import { MetricLabel, MetricValue } from "#/components/ui/metric";
import { Tag } from "#/components/ui/tag";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip";
import { classifyResult } from "#/lib/chess-utils";

type GameHeaderGame = {
	playerUsername: string;
	opponentUsername: string;
	opponentRating: number;
	playerColor: "white" | "black";
	resultDetail: string;
	openingName: string | null;
	openingEco: string | null;
	timeControl: string;
};

type GamePageHeaderProps = {
	game: GameHeaderGame;
	moveCount: number;
	gameRating: number | null;
	overallElo: number | null;
	accuracy: number | null;
};

const RESULT_STYLE = {
	win: "bg-result-win text-data-6",
	loss: "bg-result-loss text-blunder",
	draw: "bg-surface-2 text-fg-2",
} as const;

const RESULT_LABEL = { win: "WIN", loss: "LOSS", draw: "DRAW" } as const;

export function GamePageHeader({
	game,
	moveCount,
	gameRating,
	overallElo,
	accuracy,
}: GamePageHeaderProps) {
	const category = classifyResult(game.resultDetail);
	const opening = game.openingName ?? game.openingEco ?? "Unknown opening";

	return (
		<div className="mb-6 flex flex-wrap items-start justify-between gap-6">
			<div className="min-w-0 flex-[1_1_420px]">
				<div className="mb-2 flex flex-wrap items-center gap-2.5">
					<span
						className={`rounded-xs px-2 py-0.5 font-mono text-2xs font-semibold ${RESULT_STYLE[category]}`}
					>
						{RESULT_LABEL[category]}
					</span>
					<Tag>{opening}</Tag>
					<Tag>{game.timeControl}</Tag>
					<span className="mono-nums font-mono text-xs text-fg-3">
						{moveCount} moves
					</span>
				</div>
				<h1 className="text-2xl font-semibold tracking-tight-3 text-fg">
					{game.playerUsername}{" "}
					<span className="font-normal text-fg-3">vs</span>{" "}
					{game.opponentUsername}{" "}
					<span className="mono-nums font-mono text-base font-normal text-fg-3">
						· {game.opponentRating}
					</span>
				</h1>
				<p className="mt-2 max-w-160 text-sm-minus text-fg-2">
					You played {game.playerColor} ·{" "}
					{category === "win"
						? "a winning result"
						: category === "loss"
							? "a loss"
							: "a draw"}
					.
				</p>
			</div>
			<div className="flex gap-7">
				<div>
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="cursor-help">
								<MetricLabel>Game rating</MetricLabel>
							</span>
						</TooltipTrigger>
						<TooltipContent side="top" className="max-w-65">
							An estimate of how well you played overall.
						</TooltipContent>
					</Tooltip>
					<div className="mt-1">
						<MetricValue size="md">{gameRating ?? "—"}</MetricValue>
					</div>
					{overallElo !== null && gameRating !== null && (
						<div className="mt-1 mono-nums font-mono text-2xs text-fg-3">
							vs {overallElo} overall
						</div>
					)}
				</div>
				<div>
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="cursor-help">
								<MetricLabel>Accuracy</MetricLabel>
							</span>
						</TooltipTrigger>
						<TooltipContent side="top" className="max-w-65">
							How precisely you played, move by move.
						</TooltipContent>
					</Tooltip>
					<div className="mt-1">
						<MetricValue size="md">
							{accuracy !== null ? (
								<>
									{accuracy.toFixed(1)}
									<span className="text-base text-fg-3">%</span>
								</>
							) : (
								"—"
							)}
						</MetricValue>
					</div>
				</div>
			</div>
		</div>
	);
}
