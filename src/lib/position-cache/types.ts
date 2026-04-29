import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "#/db/schema";

export type Db = NodePgDatabase<typeof schema>;

export type MaiaOutput = {
	ratingGrid: number[];
	moveIndex: string[];
	/** shape: (ratingGrid.length × moveIndex.length), row-major */
	probabilities: Float32Array;
};

export type StockfishOutput = {
	evalCp: number | null;
	evalMate: number | null;
	topMoves: Array<{
		move: string;
		evalCp: number | null;
		evalMate: number | null;
	}>;
};

export type AnalysisVersions = {
	maiaVersion: string;
	stockfishVersion: string;
	stockfishDepth: number;
};

export type PositionData = {
	fen: string;
	maia: MaiaOutput | null;
	stockfish: StockfishOutput | null;
};
