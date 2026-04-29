import { inArray } from "drizzle-orm";
import { maiaCache } from "#/db/schema";
import type { Db, MaiaOutput } from "./types";

/**
 * Serialize a Float32Array to a Uint8Array (Buffer) for bytea storage.
 * Uses the underlying ArrayBuffer directly — no copy, preserves alignment.
 */
function encodeBlob(arr: Float32Array): Uint8Array {
	return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
}

/**
 * Deserialize a Uint8Array read from bytea back into a Float32Array.
 * Wraps the Buffer's backing ArrayBuffer — no copy, correct alignment.
 * byteLength / 4 gives the element count for a float32 array.
 */
function decodeBlob(buf: Uint8Array): Float32Array {
	return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function rowToMaiaOutput(row: {
	outputBlob: Uint8Array;
	moveIndex: string[];
	ratingGrid: number[];
}): MaiaOutput {
	return {
		ratingGrid: row.ratingGrid,
		moveIndex: row.moveIndex,
		probabilities: decodeBlob(row.outputBlob),
	};
}

export async function getMaiaBatch(
	db: Db,
	fens: string[],
	maiaVersion: string,
): Promise<Map<string, MaiaOutput>> {
	if (fens.length === 0) return new Map();

	const rows = await db
		.select()
		.from(maiaCache)
		.where(inArray(maiaCache.fen, fens));

	const result = new Map<string, MaiaOutput>();
	for (const row of rows) {
		if (row.maiaVersion === maiaVersion) {
			result.set(row.fen, rowToMaiaOutput(row));
		}
	}
	return result;
}

export async function hasMaia(
	db: Db,
	fen: string,
	maiaVersion: string,
): Promise<boolean> {
	const map = await getMaiaBatch(db, [fen], maiaVersion);
	return map.has(fen);
}

export async function putMaia(
	db: Db,
	fen: string,
	maiaVersion: string,
	output: MaiaOutput,
): Promise<void> {
	await db
		.insert(maiaCache)
		.values({
			fen,
			maiaVersion,
			outputBlob: encodeBlob(output.probabilities),
			moveIndex: output.moveIndex,
			ratingGrid: output.ratingGrid,
		})
		.onConflictDoNothing();
}
