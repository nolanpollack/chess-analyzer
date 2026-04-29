import { getMaiaBatch, hasMaia, putMaia } from "./maia";
import { getStockfishBatch, hasStockfish, putStockfish } from "./stockfish";
import type {
	AnalysisVersions,
	Db,
	MaiaOutput,
	PositionData,
	StockfishOutput,
} from "./types";

export type { AnalysisVersions, MaiaOutput, PositionData, StockfishOutput };

export type PositionCache = {
	hasMaia(fen: string, maiaVersion: string): Promise<boolean>;
	hasStockfish(fen: string, sfVersion: string, depth: number): Promise<boolean>;
	getMaiaBatch(
		fens: string[],
		maiaVersion: string,
	): Promise<Map<string, MaiaOutput>>;
	getStockfishBatch(
		fens: string[],
		sfVersion: string,
		depth: number,
	): Promise<Map<string, StockfishOutput>>;
	getPositionDataBatch(
		fens: string[],
		opts: AnalysisVersions,
	): Promise<Map<string, PositionData>>;
	putMaia(fen: string, maiaVersion: string, output: MaiaOutput): Promise<void>;
	putStockfish(
		fen: string,
		sfVersion: string,
		depth: number,
		output: StockfishOutput,
	): Promise<void>;
};

/**
 * Factory — each caller (worker, server fn, eval script) passes its own
 * Drizzle `db` instance. Never a singleton so we don't cross connection pools.
 */
export function createPositionCache(db: Db): PositionCache {
	return {
		hasMaia: (fen, maiaVersion) => hasMaia(db, fen, maiaVersion),

		hasStockfish: (fen, sfVersion, depth) =>
			hasStockfish(db, fen, sfVersion, depth),

		getMaiaBatch: (fens, maiaVersion) => getMaiaBatch(db, fens, maiaVersion),

		getStockfishBatch: (fens, sfVersion, depth) =>
			getStockfishBatch(db, fens, sfVersion, depth),

		/**
		 * Fetch Maia + Stockfish rows in exactly 2 parallel SQL queries,
		 * then join in-memory by FEN.
		 */
		async getPositionDataBatch(fens, opts) {
			const [maiaMap, sfMap] = await Promise.all([
				getMaiaBatch(db, fens, opts.maiaVersion),
				getStockfishBatch(db, fens, opts.stockfishVersion, opts.stockfishDepth),
			]);

			const result = new Map<string, PositionData>();
			for (const fen of fens) {
				result.set(fen, {
					fen,
					maia: maiaMap.get(fen) ?? null,
					stockfish: sfMap.get(fen) ?? null,
				});
			}
			return result;
		},

		putMaia: (fen, maiaVersion, output) =>
			putMaia(db, fen, maiaVersion, output),

		putStockfish: (fen, sfVersion, depth, output) =>
			putStockfish(db, fen, sfVersion, depth, output),
	};
}
