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
 * Extract `[%clk H:MM:SS(.s)]` annotations from a PGN, indexed by ply.
 * Both chess.com and lichess emit one clk per move in document order, so
 * the i-th match corresponds to ply i+1. If counts don't match the parsed
 * move list (e.g. correspondence games or PGNs without %clk), returns an
 * array of nulls — the caller should treat clock data as optional.
 */
export function extractClockMsByPly(
	pgn: string,
	expectedPlies: number,
): (number | null)[] {
	const re = /\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/g;
	const found: number[] = [];
	for (const m of pgn.matchAll(re)) {
		const h = Number.parseInt(m[1], 10);
		const min = Number.parseInt(m[2], 10);
		const s = Number.parseFloat(m[3]);
		found.push(Math.round((h * 3600 + min * 60 + s) * 1000));
	}
	if (found.length !== expectedPlies) {
		return new Array(expectedPlies).fill(null);
	}
	return found;
}

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
