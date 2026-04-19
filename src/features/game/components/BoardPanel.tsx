import {
	ChevronLeft,
	ChevronRight,
	ChevronsLeft,
	ChevronsRight,
	FlipVertical2,
} from "lucide-react";
import { Chessboard } from "react-chessboard";
import type { FlatMove } from "#/features/game/types";

type BoardPanelProps = {
	moves: FlatMove[];
	cursor: number;
	flipped: boolean;
	onPrev: () => void;
	onNext: () => void;
	onFirst: () => void;
	onLast: () => void;
	onFlip: () => void;
};

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function uciToSquares(uci: string | undefined) {
	if (!uci || uci.length < 4) return null;
	return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

function shouldShowBestArrow(move: FlatMove) {
	if (!move.is_player_move) return false;
	return (
		move.classification === "inaccuracy" ||
		move.classification === "mistake" ||
		move.classification === "blunder"
	);
}

export function BoardPanel({
	moves,
	cursor,
	flipped,
	onPrev,
	onNext,
	onFirst,
	onLast,
	onFlip,
}: BoardPanelProps) {
	const cur = moves[cursor];
	const position = cur?.fen_after ?? moves[0]?.fen_before ?? STARTING_FEN;

	const lastMoveSquares = uciToSquares(cur?.uci);
	const bestMoveSquares =
		cur && shouldShowBestArrow(cur) ? uciToSquares(cur.best_move_uci) : null;

	const arrows = bestMoveSquares
		? [
				{
					startSquare: bestMoveSquares.from,
					endSquare: bestMoveSquares.to,
					color: "var(--data-6)",
				},
			]
		: [];

	const squareStyles: Record<string, React.CSSProperties> = {};
	if (lastMoveSquares) {
		squareStyles[lastMoveSquares.from] = {
			backgroundColor: "color-mix(in srgb, var(--data-5) 35%, transparent)",
		};
		squareStyles[lastMoveSquares.to] = {
			backgroundColor: "color-mix(in srgb, var(--data-5) 35%, transparent)",
		};
	}

	return (
		<div>
			<div className="aspect-square w-full overflow-hidden rounded-[6px] border border-divider">
				<Chessboard
					options={{
						position,
						boardOrientation: flipped ? "black" : "white",
						arrows,
						squareStyles,
						allowDragging: false,
						animationDurationInMs: 120,
					}}
				/>
			</div>

			<div className="mt-3 flex items-center gap-2 rounded-[8px] border border-divider bg-surface p-2">
				<ControlButton label="First move" onClick={onFirst}>
					<ChevronsLeft className="h-[14px] w-[14px]" />
				</ControlButton>
				<ControlButton label="Previous move" onClick={onPrev}>
					<ChevronLeft className="h-[14px] w-[14px]" />
				</ControlButton>
				<div className="flex-1 text-center mono-nums font-mono text-[12.5px] text-fg-2">
					{cur
						? `${cur.moveNumber}${cur.side === "white" ? "." : "..."} ${cur.san}`
						: "—"}
					<span className="ml-[10px] text-[11px] text-fg-4">
						{cursor + 1} / {moves.length}
					</span>
				</div>
				<ControlButton label="Next move" onClick={onNext}>
					<ChevronRight className="h-[14px] w-[14px]" />
				</ControlButton>
				<ControlButton label="Last move" onClick={onLast}>
					<ChevronsRight className="h-[14px] w-[14px]" />
				</ControlButton>
				<div className="h-[18px] w-px bg-divider" />
				<ControlButton label="Flip board" onClick={onFlip}>
					<FlipVertical2 className="h-[14px] w-[14px]" />
				</ControlButton>
			</div>
		</div>
	);
}

function ControlButton({
	children,
	onClick,
	label,
}: {
	children: React.ReactNode;
	onClick: () => void;
	label: string;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			onClick={onClick}
			className="cursor-pointer rounded-[4px] border-none bg-transparent p-[6px] text-fg-2 transition-colors duration-[100ms] hover:bg-surface-2 hover:text-fg-1"
		>
			{children}
		</button>
	);
}
