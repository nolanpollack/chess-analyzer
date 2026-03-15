/**
 * Provider interface for chess engine analysis.
 * Implement this for each engine (Stockfish WASM, native binary, etc.).
 */

export type PositionEval = {
	/** Centipawns from white's perspective (or mate score converted to large cp value) */
	eval_cp: number;
	/** Best move in UCI notation (e.g. "g1f3") */
	best_move_uci: string;
	/** Best move in SAN notation (e.g. "Nf3"), converted via chess.js */
	best_move_san: string;
	/** Actual depth reached */
	depth: number;
	/** True if eval is a forced mate */
	is_mate: boolean;
	/** Number of moves to mate (positive = white mates), null if not a mate */
	mate_in: number | null;
};

export type AnalysisEngine = {
	/** Analyze a single position at the given depth */
	analyzePosition(fen: string, depth: number): Promise<PositionEval>;
	/** Initialize the engine (load WASM, send UCI init commands) */
	init(): Promise<void>;
	/** Clean up engine resources */
	destroy(): Promise<void>;
};
