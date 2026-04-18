/**
 * Chess analysis pipeline utilities.
 * Contains move classification logic, accuracy computation, PGN walking,
 * and deterministic move tagging (game phase, pieces involved).
 */
import { Chess } from "chess.js";
import { ANALYSIS_CONFIG } from "#/config/analysis";
import type { ChessPiece, GamePhase, MoveClassification } from "#/db/schema";

// ── Move Classification ────────────────────────────────────────────────

function countPlayerMaterial(chess: Chess, playerColor: "w" | "b"): number {
	let total = 0;
	for (const row of chess.board()) {
		for (const piece of row) {
			if (piece && piece.color === playerColor) {
				total += PIECE_VALUES[piece.type] || (piece.type === "p" ? 1 : 0);
			}
		}
	}
	return total;
}

function isBrilliantMove(
	chessBefore: Chess,
	chessAfter: Chess,
	playerColor: "w" | "b",
	loss: number,
	playerAdvantageBefore: number,
	playerAdvantageAfter: number,
): boolean {
	return (
		countPlayerMaterial(chessAfter, playerColor) <
			countPlayerMaterial(chessBefore, playerColor) &&
		loss <= 50 &&
		playerAdvantageBefore < 300 &&
		playerAdvantageAfter >= 0
	);
}

/**
 * Classify a move based on eval delta and whether it matches the engine's best move.
 *
 * @param evalDelta - Eval change from the player's perspective (negative = lost advantage)
 * @param playedUci - The move the player actually made (UCI format)
 * @param bestUci - The engine's recommended best move (UCI format)
 */
export function classifyMove(
	evalDelta: number,
	playedUci: string,
	bestUci: string,
	evalBefore: number,
	evalAfter: number,
	fenBefore: string,
	fenAfter: string,
	isWhite: boolean,
): MoveClassification {
	// Player played the engine's best move
	if (playedUci === bestUci) return "best";

	const loss = Math.abs(evalDelta);

	// Brilliant move detection:
	// - Piece sacrifice (material decreased)
	// - Near best move (within 50cp)
	// - Position not clearly winning before (< 300cp advantage)
	// - Position not losing after (evalAfter >= 0 or similar for the player)
	// evalBefore/After are from White's perspective.

	const playerAdvantageBefore = isWhite ? evalBefore : -evalBefore;
	const playerAdvantageAfter = isWhite ? evalAfter : -evalAfter;

	const chessBefore = new Chess(fenBefore);
	const chessAfter = new Chess(fenAfter);

	const playerColor = isWhite ? "w" : "b";

	if (
		isBrilliantMove(
			chessBefore,
			chessAfter,
			playerColor,
			loss,
			playerAdvantageBefore,
			playerAdvantageAfter,
		)
	) {
		return "brilliant";
	}

	if (loss >= ANALYSIS_CONFIG.classification.blunder) return "blunder";
	if (loss >= ANALYSIS_CONFIG.classification.mistake) return "mistake";
	if (loss >= ANALYSIS_CONFIG.classification.inaccuracy) return "inaccuracy";
	return "good";
}

// ── Accuracy Computation ───────────────────────────────────────────────

/**
 * Compute accuracy as the percentage of moves classified as "good" or better.
 */
export function computeAccuracy(classifications: MoveClassification[]): number {
	if (classifications.length === 0) return 0;
	const goodOrBetter = classifications.filter(
		(c) => c === "good" || c === "best" || c === "brilliant",
	).length;
	return Math.round((goodOrBetter / classifications.length) * 1000) / 10;
}

// ── PGN Walking ────────────────────────────────────────────────────────

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

	// Get all moves from the loaded game
	const history = chess.history({ verbose: true });

	// Extract the starting FEN from the loaded PGN headers (custom FEN for Chess960 etc.)
	// If no FEN header, chess.js uses the standard starting position.
	const pgnHeader = chess.header();
	const startFen =
		pgnHeader.FEN ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

	const moves: PgnMove[] = [];
	const game = new Chess(startFen);

	for (let i = 0; i < history.length; i++) {
		const move = history[i];
		const fenBefore = game.fen();
		const uci = move.from + move.to + (move.promotion ?? "");

		game.move(move.san);
		const fenAfter = game.fen();

		moves.push({
			ply: i + 1,
			san: move.san,
			uci,
			fenBefore,
			fenAfter,
			isWhite: move.color === "w",
		});
	}

	return moves;
}

/**
 * Compute the eval delta from a player's perspective.
 *
 * Evals are stored from white's perspective.
 * A negative eval_delta always means the player lost advantage.
 *
 * @param evalBefore - Eval before the move (from white's perspective)
 * @param evalAfter - Eval after the move (from white's perspective)
 * @param isWhite - Whether the player who made this move is white
 */
export function computeEvalDelta(
	evalBefore: number,
	evalAfter: number,
	isWhite: boolean,
): number {
	const rawDelta = evalAfter - evalBefore;
	// If white moved, positive rawDelta = white gained advantage
	// If black moved, negative rawDelta = black gained advantage
	return isWhite ? rawDelta : -rawDelta;
}

// ── Deterministic Move Tagging ─────────────────────────────────────────

/**
 * Material point values for non-king, non-pawn pieces.
 * Used for endgame detection: total material ≤ 13 points = endgame.
 */
const PIECE_VALUES: Record<string, number> = {
	n: 3,
	b: 3,
	r: 5,
	q: 9,
};

/**
 * Count total material on the board (excluding kings and pawns).
 * Used for game phase detection.
 */
function countMaterial(fen: string): number {
	const boardPart = fen.split(" ")[0];
	let total = 0;
	for (const char of boardPart) {
		const value = PIECE_VALUES[char.toLowerCase()];
		if (value) total += value;
	}
	return total;
}

/**
 * Check if queens are off the board.
 */
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
 *
 * @param ply - Half-move number (1-indexed)
 * @param fen - FEN string of the position after the move
 */
export function getGamePhase(ply: number, fen: string): GamePhase {
	const material = countMaterial(fen);
	const noQueens = queensOff(fen);

	// Endgame: queens off or very low material
	if (noQueens || material <= 13) {
		return "endgame";
	}

	// Opening: first 20 half-moves, but only if material is still high
	// (if material dropped significantly, we're past the opening)
	if (ply <= 20 && material >= 50) {
		return "opening";
	}

	return "middlegame";
}

/**
 * Map SAN piece prefix to ChessPiece type.
 */
const SAN_PIECE_MAP: Record<string, ChessPiece> = {
	N: "knight",
	B: "bishop",
	R: "rook",
	Q: "queen",
	K: "king",
};

/**
 * Map FEN piece character (lowercase) to ChessPiece type.
 */
const FEN_PIECE_MAP: Record<string, ChessPiece> = {
	p: "pawn",
	n: "knight",
	b: "bishop",
	r: "rook",
	q: "queen",
	k: "king",
};

/**
 * Get the piece on a given square from a FEN string.
 * Square is in algebraic notation (e.g. "e4").
 * Returns the piece character (lowercase) or null if empty.
 */
function getPieceOnSquare(fen: string, square: string): string | null {
	const boardPart = fen.split(" ")[0];
	const file = square.charCodeAt(0) - "a".charCodeAt(0); // 0-7
	const rank = Number.parseInt(square[1], 10) - 1; // 0-7
	const rows = boardPart.split("/");
	const row = rows[7 - rank]; // FEN ranks go from 8 to 1

	let col = 0;
	for (const char of row) {
		if (col > file) return null;
		const digit = Number.parseInt(char, 10);
		if (!Number.isNaN(digit)) {
			if (col + digit > file) return null; // square is empty
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
 * - Captured piece: compare fenBefore and fenAfter to detect captures
 * - For castling: returns ['king', 'rook']
 * - For en passant: returns ['pawn', 'pawn']
 *
 * @param san - Standard algebraic notation of the move
 * @param uci - UCI notation (e.g. "e2e4") for square extraction
 * @param fenBefore - FEN before the move
 */
export function getPiecesInvolved(
	san: string,
	uci: string,
	fenBefore: string,
): ChessPiece[] {
	const pieces: Set<ChessPiece> = new Set();

	// Castling
	if (san === "O-O" || san === "O-O-O") {
		pieces.add("king");
		pieces.add("rook");
		return Array.from(pieces);
	}

	// Determine the moving piece from SAN
	const firstChar = san[0];
	if (firstChar && SAN_PIECE_MAP[firstChar]) {
		pieces.add(SAN_PIECE_MAP[firstChar]);
	} else {
		// No piece prefix = pawn move
		pieces.add("pawn");
	}

	// Check for captures — SAN contains 'x'
	if (san.includes("x")) {
		// For en passant, the captured piece is a pawn but it's not on the target square
		// in fenBefore. We can detect en passant by checking if a pawn captures to an
		// empty square (the target square has no piece in fenBefore).
		const toSquare = uci.slice(2, 4);
		const capturedPieceChar = getPieceOnSquare(fenBefore, toSquare);

		if (capturedPieceChar) {
			const capturedPiece = FEN_PIECE_MAP[capturedPieceChar];
			if (capturedPiece) pieces.add(capturedPiece);
		} else {
			// En passant — captured piece is not on the target square
			pieces.add("pawn");
		}
	}

	return Array.from(pieces);
}

import type { Concept, MoveAnalysis } from "#/db/schema";

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

	const opponentMaterialBefore = countMaterialColor(chessBefore, opponentColor);
	const opponentMaterialBest = countMaterialColor(chessBest, opponentColor);
	const opponentMaterialPlayed = countMaterialColor(chessAfter, opponentColor);

	return (
		opponentMaterialBest < opponentMaterialBefore &&
		opponentMaterialPlayed === opponentMaterialBefore
	);
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
		const rankIndex = 8 - parseInt(rank, 10); // '1' -> 7, '8' -> 0
		for (const piece of board[rankIndex]) {
			if (
				piece &&
				piece.color === color &&
				piece.type !== "p" &&
				piece.type !== "k" &&
				piece.type !== "r"
			) {
				count++; // counting N and B for development
			}
		}
		return count;
	};

	const piecesOnStartBefore = countBackRankPieces(
		chessBefore,
		playerColor,
		startRank,
	);
	const piecesOnStartBest = countBackRankPieces(
		chessBest,
		playerColor,
		startRank,
	);
	const piecesOnStartPlayed = countBackRankPieces(
		chessAfter,
		playerColor,
		startRank,
	);

	return (
		piecesOnStartBest < piecesOnStartBefore &&
		piecesOnStartPlayed === piecesOnStartBefore
	);
}

function detectKingSafety(
	chessAfter: Chess,
	playerColor: "w" | "b",
	isWhite: boolean,
): boolean {
	const rank2 = isWhite ? "2" : "7";
	const countPawnsOnRank2 = (chess: Chess, color: "w" | "b", rank: string) => {
		let count = 0;
		const board = chess.board();
		const rankIndex = 8 - parseInt(rank, 10);
		for (const piece of board[rankIndex]) {
			if (piece && piece.color === color && piece.type === "p") {
				count++;
			}
		}
		return count;
	};

	return countPawnsOnRank2(chessAfter, playerColor, rank2) < 2;
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
