/**
 * Provider interface for chess engine analysis.
 * Implement this for each engine (Stockfish WASM, native binary, etc.).
 */

/** A single principal variation from the engine. Eval is from white's perspective. */
export type PrincipalVariation = {
	/** Centipawns from white's perspective (or mate score converted to large cp value) */
	eval_cp: number;
	/** Best move in UCI notation (e.g. "g1f3") */
	move_uci: string;
	/** Best move in SAN notation (e.g. "Nf3"), converted via chess.js */
	move_san: string;
};

export type PositionEval = {
	/** Centipawns from white's perspective (or mate score converted to large cp value) — always PV1 */
	eval_cp: number;
	/** Best move in UCI notation (e.g. "g1f3") — always PV1 */
	best_move_uci: string;
	/** Best move in SAN notation (e.g. "Nf3"), converted via chess.js — always PV1 */
	best_move_san: string;
	/** Actual depth reached */
	depth: number;
	/** True if eval is a forced mate */
	is_mate: boolean;
	/** Number of moves to mate (positive = white mates), null if not a mate */
	mate_in: number | null;
	/**
	 * All principal variations returned by the engine (up to multipv count).
	 * Index 0 is always the best move (same as eval_cp / best_move_*).
	 * Evals are from white's perspective.
	 */
	pvs: PrincipalVariation[];
};

export type AnalysisEngine = {
	/** Analyze a single position at the given depth */
	analyzePosition(fen: string, depth: number): Promise<PositionEval>;
	/** Initialize the engine (load WASM, send UCI init commands) */
	init(): Promise<void>;
	/** Clean up engine resources */
	destroy(): Promise<void>;
};
