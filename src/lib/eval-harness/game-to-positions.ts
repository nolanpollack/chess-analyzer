import { Chess } from "chess.js";
import type { TimeControlClass } from "./filter";
import { classifyTimeControl } from "./filter";

export type PositionEntry = {
	fen: string;
	playedMove: string; // UCI
};

export type GameSide = {
	side: "white" | "black";
	trueRating: number;
	opponentRating: number;
	timeControlClass: TimeControlClass;
	positions: PositionEntry[];
};

export type ParsedGame = {
	gameId: string;
	white: GameSide;
	black: GameSide;
};

/**
 * Extracts per-side position lists from a PGN string.
 * Returns null if the PGN cannot be parsed or ELOs are missing.
 */
export function pgnGameToSides(pgn: string): ParsedGame | null {
	const chess = new Chess();
	try {
		chess.loadPgn(pgn);
	} catch {
		return null;
	}

	const headers = chess.header();
	const whiteElo = headers["WhiteElo"]
		? parseInt(headers["WhiteElo"], 10)
		: NaN;
	const blackElo = headers["BlackElo"]
		? parseInt(headers["BlackElo"], 10)
		: NaN;
	if (Number.isNaN(whiteElo) || Number.isNaN(blackElo)) return null;

	const tc = headers["TimeControl"];
	const timeControlClass = tc ? classifyTimeControl(tc) : null;
	if (!timeControlClass) return null;

	const gameId = headers["Site"] ?? headers["GameId"] ?? crypto.randomUUID();

	const history = chess.history({ verbose: true });
	chess.reset();
	chess.loadPgn(pgn);

	// Re-walk from the start
	const game = new Chess();
	const whiteMoves: PositionEntry[] = [];
	const blackMoves: PositionEntry[] = [];

	for (const move of history) {
		const fenBefore = game.fen();
		const uci = move.from + move.to + (move.promotion ?? "");
		const sideToMove = game.turn(); // 'w' or 'b'

		game.move(move.san);

		if (sideToMove === "w") {
			whiteMoves.push({ fen: fenBefore, playedMove: uci });
		} else {
			blackMoves.push({ fen: fenBefore, playedMove: uci });
		}
	}

	return {
		gameId,
		white: {
			side: "white",
			trueRating: whiteElo,
			opponentRating: blackElo,
			timeControlClass,
			positions: whiteMoves,
		},
		black: {
			side: "black",
			trueRating: blackElo,
			opponentRating: whiteElo,
			timeControlClass,
			positions: blackMoves,
		},
	};
}
