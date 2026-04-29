/**
 * analyze-position-stockfish worker job.
 *
 * Runs Stockfish at depth 18 with MultiPV=5 on a single FEN and stores
 * the top-5 moves in the position cache (stockfish_cache table).
 *
 * Idempotent: checks for an existing cache row before running the engine.
 * Retries: pg-boss handles retries by re-throwing on error.
 *
 * Engine pool: engines are initialised once and reused across jobs.
 * Pool size defaults to STOCKFISH_POOL_SIZE env var or 4.
 */
import type { Job, PgBoss } from "pg-boss";
import {
	ANALYZE_POSITION_STOCKFISH,
	type AnalyzePositionStockfishPayload,
} from "#/lib/analysis-dispatcher/job-names";
import type { StockfishPool } from "#/lib/engine-pool/stockfish-pool";
import { createStockfishPool } from "#/lib/engine-pool/stockfish-pool";
import { createPositionCache } from "#/lib/position-cache";
import type { StockfishOutput } from "#/lib/position-cache/types";
import type { AnalysisEngine, PositionEval } from "#/providers/analysis-engine";
import { getWorkerDb } from "#/worker/db";

export { ANALYZE_POSITION_STOCKFISH };

/** Stockfish npm package version — matches the binary bundled in node_modules/stockfish */
export const STOCKFISH_VERSION = "stockfish-wasm-18.0.5";

/** Number of principal variations to fetch per position */
const MULTIPV = 5;

const POOL_SIZE = process.env.STOCKFISH_POOL_SIZE
	? parseInt(process.env.STOCKFISH_POOL_SIZE, 10)
	: 4;

let pool: StockfishPool | null = null;
let shutdownRegistered = false;

function getPool(): StockfishPool {
	if (!pool) {
		pool = createStockfishPool({ size: POOL_SIZE, multipv: MULTIPV });
		registerShutdownHook();
	}
	return pool;
}

function registerShutdownHook(): void {
	if (shutdownRegistered) return;
	shutdownRegistered = true;

	async function shutdown(signal: string) {
		console.log(
			`[analyze-position-stockfish] ${signal} received — destroying engine pool`,
		);
		if (pool) {
			await pool.destroyAll();
		}
	}

	process.once("SIGTERM", () => shutdown("SIGTERM").catch(console.error));
	process.once("SIGINT", () => shutdown("SIGINT").catch(console.error));
}

export function registerAnalyzePositionStockfishJob(boss: PgBoss) {
	boss.work<AnalyzePositionStockfishPayload>(
		ANALYZE_POSITION_STOCKFISH,
		{ pollingIntervalSeconds: 5, batchSize: 4 },
		async (jobs: Job<AnalyzePositionStockfishPayload>[]) => {
			const activePool = getPool();
			await Promise.all(
				jobs.map((job) => handleAnalyzePositionStockfish(job.data, activePool)),
			);
		},
	);
}

export async function handleAnalyzePositionStockfish(
	data: AnalyzePositionStockfishPayload,
	activePool: StockfishPool,
): Promise<void> {
	const { fen, stockfishVersion, stockfishDepth } = data;
	console.log(
		`[analyze-position-stockfish] fen="${fen}" version=${stockfishVersion} depth=${stockfishDepth}`,
	);

	const cache = createPositionCache(getWorkerDb());

	const already = await cache.hasStockfish(
		fen,
		stockfishVersion,
		stockfishDepth,
	);
	if (already) {
		console.log(
			`[analyze-position-stockfish] Cache hit, skipping fen="${fen}"`,
		);
		return;
	}

	try {
		const result = await activePool.run((engine: AnalysisEngine) =>
			engine.analyzePosition(fen, stockfishDepth),
		);
		const output = buildStockfishOutput(result);

		await cache.putStockfish(fen, stockfishVersion, stockfishDepth, output);

		console.log(
			`[analyze-position-stockfish] Cached fen="${fen}" (${output.topMoves.length} top moves)`,
		);
	} catch (err) {
		console.error(`[analyze-position-stockfish] Failed for fen="${fen}":`, err);
		throw err;
	}
}

function buildStockfishOutput(result: PositionEval): StockfishOutput {
	return {
		evalCp: result.is_mate ? null : result.eval_cp,
		evalMate: result.mate_in ?? null,
		topMoves: result.pvs.map((pv) => ({
			// Downstream consumers (Maia comparison) expect UCI notation
			move: pv.move_uci,
			evalCp: result.is_mate ? null : pv.eval_cp,
			evalMate: null,
		})),
	};
}
