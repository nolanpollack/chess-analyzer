/**
 * Chess analysis pipeline utilities.
 * Contains move classification logic, accuracy computation, and PGN walking.
 */
import { Chess } from "chess.js";
import { ANALYSIS_CONFIG } from "#/config/analysis";
import type { MoveClassification } from "#/db/schema";

// ── Move Classification ────────────────────────────────────────────────

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
): MoveClassification {
	// Player played the engine's best move
	if (playedUci === bestUci) return "best";

	// Player's move improved eval beyond expectation (rare)
	if (evalDelta > 10) return "brilliant";

	const loss = Math.abs(evalDelta);
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
