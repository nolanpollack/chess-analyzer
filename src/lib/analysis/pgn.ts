import { Chess } from "chess.js";

export type PgnMove = {
	ply: number;
	san: string;
	uci: string;
	fenBefore: string;
	fenAfter: string;
	isWhite: boolean;
};

/**
 * Walk through a PGN and extract all moves with their FEN positions.
 * Returns an array of moves with before/after FENs for engine analysis.
 */
export function walkPgn(pgn: string): PgnMove[] {
	const chess = new Chess();
	chess.loadPgn(pgn);

	const history = chess.history({ verbose: true });

	const pgnHeader = chess.header();
	const startFen =
		pgnHeader.FEN ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

	const result: PgnMove[] = [];
	const game = new Chess(startFen);

	for (let i = 0; i < history.length; i++) {
		const move = history[i];
		const fenBefore = game.fen();
		const uci = move.from + move.to + (move.promotion ?? "");

		game.move(move.san);
		const fenAfter = game.fen();

		result.push({
			ply: i + 1,
			san: move.san,
			uci,
			fenBefore,
			fenAfter,
			isWhite: move.color === "w",
		});
	}

	return result;
}
