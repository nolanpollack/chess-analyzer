/**
 * Direct-batch Maia inference: bypass the analyze-position-maia queue and
 * the dispatcher poll loop, call the sidecar's `/infer-batch` endpoint once
 * for all missing FENs, write results to `maia_cache`.
 *
 * Used by:
 *  - `analyze-game-maia` (production worker job, via `computeAndPersistMaiaRating`)
 *  - eval harness (`evaluateGame` with `directBatch: true`, the default)
 *
 * Why production prefers this over the queue: each game has 30-150 unique
 * FENs. Going through `analyze-position-maia` (batchSize: 2, single-FEN
 * `/infer` per call) creates a multi-minute polling stall per game when
 * any backlog exists. The sidecar's `/infer-batch` handles the same
 * positions in one round-trip and internally deduplicates forward passes
 * across the 11 coarse Elo buckets, so it is also faster end-to-end.
 */
import type { AnalysisVersions } from "#/lib/analysis-dispatcher";
import type { MaiaInferBatchResult } from "#/lib/maia-client";
import { inferMaiaBatch } from "#/lib/maia-client";
import type { MaiaOutput, PositionCache } from "#/lib/position-cache";

/**
 * Convert a raw /infer-batch result row into the Float32Array-based MaiaOutput
 * expected by the rating aggregator.
 * Probabilities from the service are number[][] (row-major, 41 × L);
 * we flatten to a single Float32Array in row-major order.
 */
function batchResultToMaiaOutput(
	result: MaiaInferBatchResult,
	ratingGrid: number[],
): MaiaOutput {
	const rows = result.probabilities;
	const totalLen = rows.reduce((s, row) => s + row.length, 0);
	const flat = new Float32Array(totalLen);
	let offset = 0;
	for (const row of rows) {
		flat.set(row, offset);
		offset += row.length;
	}
	return {
		ratingGrid,
		moveIndex: result.moveIndex,
		probabilities: flat,
	};
}

/**
 * Returns Maia outputs for `uniqueFens`, calling `/infer-batch` for any
 * cache misses and persisting the results to `maia_cache`. Idempotent:
 * fully-cached input issues no HTTP call.
 */
export async function ensureMaiaDirectBatch(
	uniqueFens: string[],
	versions: AnalysisVersions,
	cache: PositionCache,
): Promise<Map<string, MaiaOutput>> {
	const cached = await cache.getMaiaBatch(uniqueFens, versions.maiaVersion);
	const missingFens = uniqueFens.filter((fen) => !cached.has(fen));
	if (missingFens.length === 0) return cached;

	const batchResponse = await inferMaiaBatch(missingFens);
	await Promise.all(
		batchResponse.results.map((result) =>
			cache.putMaia(
				result.fen,
				versions.maiaVersion,
				batchResultToMaiaOutput(result, batchResponse.ratingGrid),
			),
		),
	);
	for (const result of batchResponse.results) {
		cached.set(
			result.fen,
			batchResultToMaiaOutput(result, batchResponse.ratingGrid),
		);
	}
	return cached;
}
