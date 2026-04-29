import { and, eq, inArray } from "drizzle-orm";
import { stockfishCache } from "#/db/schema";
import type { Db, StockfishOutput } from "./types";

function rowToStockfishOutput(row: {
	evalCp: number | null;
	evalMate: number | null;
	topMoves: Array<{
		move: string;
		evalCp: number | null;
		evalMate: number | null;
	}>;
}): StockfishOutput {
	return {
		evalCp: row.evalCp,
		evalMate: row.evalMate,
		topMoves: row.topMoves,
	};
}

export async function getStockfishBatch(
	db: Db,
	fens: string[],
	sfVersion: string,
	depth: number,
): Promise<Map<string, StockfishOutput>> {
	if (fens.length === 0) return new Map();

	const rows = await db
		.select()
		.from(stockfishCache)
		.where(
			and(
				inArray(stockfishCache.fen, fens),
				eq(stockfishCache.stockfishVersion, sfVersion),
				eq(stockfishCache.stockfishDepth, depth),
			),
		);

	const result = new Map<string, StockfishOutput>();
	for (const row of rows) {
		result.set(row.fen, rowToStockfishOutput(row));
	}
	return result;
}

export async function hasStockfish(
	db: Db,
	fen: string,
	sfVersion: string,
	depth: number,
): Promise<boolean> {
	const map = await getStockfishBatch(db, [fen], sfVersion, depth);
	return map.has(fen);
}

export async function putStockfish(
	db: Db,
	fen: string,
	sfVersion: string,
	depth: number,
	output: StockfishOutput,
): Promise<void> {
	await db
		.insert(stockfishCache)
		.values({
			fen,
			stockfishVersion: sfVersion,
			stockfishDepth: depth,
			evalCp: output.evalCp,
			evalMate: output.evalMate,
			topMoves: output.topMoves,
		})
		.onConflictDoNothing();
}
