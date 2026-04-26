import { Chess } from "chess.js";
import type { ChessPiece, Concept, GamePhase, MoveAnalysis } from "#/db/schema";

const PIECE_VALUES: Record<string, number> = {
	n: 3,
	b: 3,
	r: 5,
	q: 9,
};

function countMaterial(fen: string): number {
	const boardPart = fen.split(" ")[0];
	let total = 0;
	for (const char of boardPart) {
		const value = PIECE_VALUES[char.toLowerCase()];
		if (value) total += value;
	}
	return total;
}

function queensOff(fen: string): boolean {
	const boardPart = fen.split(" ")[0];
	return !boardPart.includes("q") && !boardPart.includes("Q");
}

/**
 * Determine the game phase based on ply number and board material.
 *
 * - Opening: first ~20 half-moves, unless major pieces are already traded
 * - Endgame: queens off the board, or total non-king/pawn material ≤ 13 points
 * - Middlegame: everything else
 */
export function getGamePhase(ply: number, fen: string): GamePhase {
	const material = countMaterial(fen);
	const noQueens = queensOff(fen);

	if (noQueens || material <= 13) return "endgame";
	if (ply <= 20 && material >= 50) return "opening";
	return "middlegame";
}

const SAN_PIECE_MAP: Record<string, ChessPiece> = {
	N: "knight",
	B: "bishop",
	R: "rook",
	Q: "queen",
	K: "king",
};

const FEN_PIECE_MAP: Record<string, ChessPiece> = {
	p: "pawn",
	n: "knight",
	b: "bishop",
	r: "rook",
	q: "queen",
	k: "king",
};

function getPieceOnSquare(fen: string, square: string): string | null {
	const boardPart = fen.split(" ")[0];
	const file = square.charCodeAt(0) - "a".charCodeAt(0);
	const rank = Number.parseInt(square[1], 10) - 1;
	const rows = boardPart.split("/");
	const row = rows[7 - rank];

	let col = 0;
	for (const char of row) {
		if (col > file) return null;
		const digit = Number.parseInt(char, 10);
		if (!Number.isNaN(digit)) {
			if (col + digit > file) return null;
			col += digit;
		} else {
			if (col === file) return char.toLowerCase();
			col++;
		}
	}
	return null;
}

/**
 * Extract pieces involved in a move from SAN notation and board context.
 *
 * - Primary piece: from SAN notation ('N' → knight, no prefix → pawn, etc.)
 * - Captured piece: from fenBefore at the destination square
 * - For castling: returns ['king', 'rook']
 * - For en passant: returns ['pawn', 'pawn'] (deduplicated to ['pawn'])
 */
export function getPiecesInvolved(
	san: string,
	uci: string,
	fenBefore: string,
): ChessPiece[] {
	const pieces: Set<ChessPiece> = new Set();

	if (san === "O-O" || san === "O-O-O") {
		pieces.add("king");
		pieces.add("rook");
		return Array.from(pieces);
	}

	const firstChar = san[0];
	if (firstChar && SAN_PIECE_MAP[firstChar]) {
		pieces.add(SAN_PIECE_MAP[firstChar]);
	} else {
		pieces.add("pawn");
	}

	if (san.includes("x")) {
		const toSquare = uci.slice(2, 4);
		const capturedPieceChar = getPieceOnSquare(fenBefore, toSquare);

		if (capturedPieceChar) {
			const capturedPiece = FEN_PIECE_MAP[capturedPieceChar];
			if (capturedPiece) pieces.add(capturedPiece);
		} else {
			pieces.add("pawn");
		}
	}

	return Array.from(pieces);
}

function detectHangingPiece(
	chessBefore: Chess,
	chessAfter: Chess,
	chessBest: Chess,
	opponentColor: "w" | "b",
): boolean {
	const countMaterialColor = (chess: Chess, color: "w" | "b") => {
		let total = 0;
		for (const row of chess.board()) {
			for (const piece of row) {
				if (piece && piece.color === color) {
					total += PIECE_VALUES[piece.type] || (piece.type === "p" ? 1 : 0);
				}
			}
		}
		return total;
	};

	const before = countMaterialColor(chessBefore, opponentColor);
	const best = countMaterialColor(chessBest, opponentColor);
	const played = countMaterialColor(chessAfter, opponentColor);

	return best < before && played === before;
}

function detectDevelopment(
	moveData: MoveAnalysis,
	chessBefore: Chess,
	chessAfter: Chess,
	chessBest: Chess,
	playerColor: "w" | "b",
	isWhite: boolean,
): boolean {
	if (moveData.ply > 20) return false;

	const startRank = isWhite ? "1" : "8";

	const countBackRankPieces = (
		chess: Chess,
		color: "w" | "b",
		rank: string,
	) => {
		let count = 0;
		const board = chess.board();
		const rankIndex = 8 - Number.parseInt(rank, 10);
		for (const piece of board[rankIndex]) {
			if (
				piece &&
				piece.color === color &&
				piece.type !== "p" &&
				piece.type !== "k" &&
				piece.type !== "r"
			) {
				count++;
			}
		}
		return count;
	};

	const before = countBackRankPieces(chessBefore, playerColor, startRank);
	const best = countBackRankPieces(chessBest, playerColor, startRank);
	const played = countBackRankPieces(chessAfter, playerColor, startRank);

	return best < before && played === before;
}

function detectKingSafety(
	chessAfter: Chess,
	playerColor: "w" | "b",
	isWhite: boolean,
): boolean {
	const rank2 = isWhite ? "2" : "7";
	const countPawnsOnRank = (chess: Chess, color: "w" | "b", rank: string) => {
		let count = 0;
		const board = chess.board();
		const rankIndex = 8 - Number.parseInt(rank, 10);
		for (const piece of board[rankIndex]) {
			if (piece && piece.color === color && piece.type === "p") count++;
		}
		return count;
	};

	return countPawnsOnRank(chessAfter, playerColor, rank2) < 2;
}

export function detectConcepts(
	moveData: MoveAnalysis,
	fenBefore: string,
	fenAfter: string,
	bestMoveFenAfter: string,
): Concept[] {
	const concepts: Concept[] = [];

	const chessBefore = new Chess(fenBefore);
	const chessAfter = new Chess(fenAfter);
	const chessBest = new Chess(bestMoveFenAfter);

	const isWhite = chessBefore.turn() === "w";
	const playerColor = isWhite ? "w" : "b";
	const opponentColor = isWhite ? "b" : "w";

	if (detectHangingPiece(chessBefore, chessAfter, chessBest, opponentColor)) {
		concepts.push("hanging-piece");
	}
	if (
		detectDevelopment(
			moveData,
			chessBefore,
			chessAfter,
			chessBest,
			playerColor,
			isWhite,
		)
	) {
		concepts.push("development");
	}
	if (detectKingSafety(chessAfter, playerColor, isWhite)) {
		concepts.push("king-safety");
	}

	return concepts;
}
