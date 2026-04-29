export const ANALYZE_POSITION_MAIA = "analyze-position-maia";
export const ANALYZE_POSITION_STOCKFISH = "analyze-position-stockfish";

export type AnalyzePositionMaiaPayload = { fen: string; maiaVersion: string };
export type AnalyzePositionStockfishPayload = {
	fen: string;
	stockfishVersion: string;
	stockfishDepth: number;
};
