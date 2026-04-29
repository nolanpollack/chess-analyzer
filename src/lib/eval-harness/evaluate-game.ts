import type { AnalysisVersions } from "#/lib/analysis-dispatcher";
import { ensureAnalyzed } from "#/lib/analysis-dispatcher";
import type { MaiaInferBatchResult } from "#/lib/maia-client";
import { inferMaiaBatch } from "#/lib/maia-client";
import type { MaiaOutput, PositionCache } from "#/lib/position-cache";
import type { Position } from "#/lib/rating-aggregator";
import { estimateRating } from "#/lib/rating-aggregator";
import type { PriorName } from "./config";
import type { TimeControlClass } from "./filter";
import type { ParsedGame } from "./game-to-positions";
import { buildPrior } from "./prior";

export type EvalRow = {
	gameId: string;
	side: "white" | "black";
	trueRating: number;
	opponentRating: number;
	timeControlClass: TimeControlClass;
	nPositions: number;
	predicted: number;
	ciLow: number;
	ciHigh: number;
	withinCi: boolean;
	// Game-level cache stats repeated on each side row for convenience
	cacheHits: number;
	cacheMisses: number;
	uniquePositions: number;
};

type EvaluateGameOptions = {
	versions: AnalysisVersions;
	epsilon: number;
	prior: PriorName;
	waitTimeoutMs: number;
	skipStockfish?: boolean;
	/**
	 * When true (default in eval), bypass the worker queue and call
	 * /infer-batch directly for Maia positions that are not yet cached.
	 * When false, use ensureAnalyzed + the worker queue path (production flow).
	 * Default: true.
	 */
	directBatch?: boolean;
};

async function buildPositionsForSide(
	fens: string[],
	playedMoves: string[],
	maiaMap: Map<string, MaiaOutput>,
): Promise<Position[]> {
	const positions: Position[] = [];
	for (let i = 0; i < fens.length; i++) {
		const maia = maiaMap.get(fens[i]);
		if (!maia) continue;
		positions.push({ fen: fens[i], playedMove: playedMoves[i], maia });
	}
	return positions;
}

async function countCacheHits(
	fens: string[],
	versions: EvaluateGameOptions["versions"],
	cache: PositionCache,
): Promise<number> {
	const present = await cache.getMaiaBatch(fens, versions.maiaVersion);
	return present.size;
}

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
 * Direct-batch path: check cache for misses, call /infer-batch for any missing
 * positions, write results back to cache, return the final merged map.
 *
 * When skipStockfish is true we skip SF entirely (safe because the aggregator
 * does not consume SF data).
 */
async function ensureMaiaDirectBatch(
	uniqueFens: string[],
	versions: AnalysisVersions,
	cache: PositionCache,
): Promise<Map<string, MaiaOutput>> {
	const cached = await cache.getMaiaBatch(uniqueFens, versions.maiaVersion);
	const missingFens = uniqueFens.filter((fen) => !cached.has(fen));

	if (missingFens.length > 0) {
		const batchResponse = await inferMaiaBatch(missingFens);
		await Promise.all(
			batchResponse.results.map((result) => {
				const output = batchResultToMaiaOutput(
					result,
					batchResponse.ratingGrid,
				);
				return cache.putMaia(result.fen, versions.maiaVersion, output);
			}),
		);
		// Merge newly fetched into cached map
		for (const result of batchResponse.results) {
			cached.set(
				result.fen,
				batchResultToMaiaOutput(result, batchResponse.ratingGrid),
			);
		}
	}

	return cached;
}

/**
 * Queue path: use ensureAnalyzed to populate SF + Maia via the worker, then
 * read Maia from cache.
 */
async function ensureMaiaViaQueue(
	allFens: string[],
	_uniqueFens: string[],
	versions: AnalysisVersions,
	cache: PositionCache,
	waitTimeoutMs: number,
	skipStockfish: boolean,
): Promise<Map<string, MaiaOutput>> {
	await ensureAnalyzed(allFens, versions, cache, {
		wait: true,
		waitTimeoutMs,
		skipStockfish,
	});
	return cache.getMaiaBatch(allFens, versions.maiaVersion);
}

/**
 * Ensures all positions in the game are analyzed, then estimates ratings
 * for both sides. Returns two EvalRows (one per side).
 */
export async function evaluateGame(
	game: ParsedGame,
	cache: PositionCache,
	opts: EvaluateGameOptions,
): Promise<EvalRow[]> {
	const allFens = [
		...game.white.positions.map((p) => p.fen),
		...game.black.positions.map((p) => p.fen),
	];
	const uniqueFens = [...new Set(allFens)];
	const uniquePositions = uniqueFens.length;

	const hitsBeforeAnalysis = await countCacheHits(
		uniqueFens,
		opts.versions,
		cache,
	);

	const directBatch = opts.directBatch ?? true;
	const skipStockfish = opts.skipStockfish ?? false;

	let maiaMap: Map<string, MaiaOutput>;

	if (directBatch) {
		maiaMap = await ensureMaiaDirectBatch(uniqueFens, opts.versions, cache);

		// If SF is also needed (directBatch + !skipStockfish), populate it via ensureAnalyzed
		if (!skipStockfish) {
			await ensureAnalyzed(allFens, opts.versions, cache, {
				wait: true,
				waitTimeoutMs: opts.waitTimeoutMs,
				skipStockfish: false,
			});
		}

		// Re-read so allFens (including duplicates) are covered in the map
		maiaMap = await cache.getMaiaBatch(allFens, opts.versions.maiaVersion);
	} else {
		maiaMap = await ensureMaiaViaQueue(
			allFens,
			uniqueFens,
			opts.versions,
			cache,
			opts.waitTimeoutMs,
			skipStockfish,
		);
	}

	const cacheHits = hitsBeforeAnalysis;
	const cacheMisses = uniquePositions - cacheHits;

	const rows: EvalRow[] = [];

	for (const side of [game.white, game.black] as const) {
		if (side.positions.length === 0) continue;

		const fens = side.positions.map((p) => p.fen);
		const moves = side.positions.map((p) => p.playedMove);
		const positions = await buildPositionsForSide(fens, moves, maiaMap);

		if (positions.length === 0) continue;

		const prior = buildPrior(opts.prior, positions[0].maia.ratingGrid);
		const estimate = estimateRating(positions, {
			epsilon: opts.epsilon,
			prior,
		});

		rows.push({
			gameId: game.gameId,
			side: side.side,
			trueRating: side.trueRating,
			opponentRating: side.opponentRating,
			timeControlClass: side.timeControlClass,
			nPositions: positions.length,
			predicted: estimate.pointEstimate,
			ciLow: estimate.ciLow,
			ciHigh: estimate.ciHigh,
			withinCi:
				side.trueRating >= estimate.ciLow && side.trueRating <= estimate.ciHigh,
			cacheHits,
			cacheMisses,
			uniquePositions,
		});
	}

	return rows;
}
