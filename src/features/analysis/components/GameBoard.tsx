import type { PieceRenderObject } from "react-chessboard";
import { Chessboard, defaultPieces } from "react-chessboard";
import type { MoveAnalysis } from "#/db/schema";
import { getClassificationArrowColor } from "#/features/analysis/utils";

// Wrap default pieces with drop-shadow filters to improve contrast against gray board squares.
// Black pieces get a white glow; white pieces get a dark shadow for definition.
const customPieces: PieceRenderObject = Object.fromEntries(
	Object.entries(defaultPieces).map(([key, Piece]) => [
		key,
		(props?: {
			fill?: string;
			square?: string;
			svgStyle?: React.CSSProperties;
		}) => (
			<Piece
				{...props}
				svgStyle={{
					...props?.svgStyle,
					filter: key.startsWith("b")
						? "drop-shadow(0 0 1.5px rgba(255,255,255,0.85))"
						: "drop-shadow(0 0 1px rgba(0,0,0,0.5))",
				}}
			/>
		),
	]),
);

type Arrow = {
	startSquare: string;
	endSquare: string;
	color: string;
};

type GameBoardProps = {
	fen: string;
	boardOrientation: "white" | "black";
	currentMove: MoveAnalysis | null;
};

export function GameBoard({
	fen,
	boardOrientation,
	currentMove,
}: GameBoardProps) {
	const arrows: Arrow[] = [];
	const squareStyles: Record<string, React.CSSProperties> = {};

	if (currentMove) {
		const playedFrom = currentMove.uci.slice(0, 2);
		const playedTo = currentMove.uci.slice(2, 4);

		// Square highlights show the played move; arrow is reserved for the engine's best move
		const classColor = getClassificationArrowColor(currentMove.classification);
		squareStyles[playedFrom] = { backgroundColor: `${classColor}33` };
		squareStyles[playedTo] = { backgroundColor: `${classColor}55` };

		if (
			currentMove.uci !== currentMove.best_move_uci &&
			currentMove.best_move_uci
		) {
			// Show only the best move as an arrow
			arrows.push({
				startSquare: currentMove.best_move_uci.slice(0, 2),
				endSquare: currentMove.best_move_uci.slice(2, 4),
				color: "rgba(16, 185, 129, 0.6)",
			});
		} else {
			// Played the best move — green arrow confirms it
			arrows.push({
				startSquare: playedFrom,
				endSquare: playedTo,
				color: "rgba(16, 185, 129, 0.6)",
			});
		}
	}

	return (
		<div className="aspect-square w-full overflow-hidden rounded-lg border">
			<Chessboard
				options={{
					position: fen,
					boardOrientation,
					animationDurationInMs: 200,
					allowDragging: false,
					pieces: customPieces,
					arrows,
					squareStyles,
					darkSquareStyle: {
						backgroundColor: "var(--board-dark)",
					},
					lightSquareStyle: {
						backgroundColor: "var(--board-light)",
					},
					boardStyle: {
						overflow: "hidden",
					},
					showNotation: true,
					darkSquareNotationStyle: {
						color: "var(--color-zinc-500)",
					},
					lightSquareNotationStyle: {
						color: "var(--color-zinc-500)",
					},
					alphaNotationStyle: {
						fontSize: "10px",
						position: "absolute" as const,
						bottom: 1,
						right: 2,
						userSelect: "none" as const,
						fontWeight: 600,
					},
					numericNotationStyle: {
						fontSize: "10px",
						position: "absolute" as const,
						top: 1,
						left: 2,
						userSelect: "none" as const,
						fontWeight: 600,
					},
				}}
			/>
		</div>
	);
}
