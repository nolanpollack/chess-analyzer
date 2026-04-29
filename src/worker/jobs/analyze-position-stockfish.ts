/**
 * analyze-position-stockfish worker job.
 *
 * Runs Stockfish at depth 18 with MultiPV=5 on a single FEN and stores
 * the top-5 moves in the position cache (stockfish_cache table).
 *
 * Idempotent: checks for an existing cache row before running the engine.
 * Retries: pg-boss handles retries by re-throwing on error.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import type { Job, PgBoss } from "pg-boss";
import * as schema from "#/db/schema";
import {
	ANALYZE_POSITION_STOCKFISH,
	type AnalyzePositionStockfishPayload,
} from "#/lib/analysis-dispatcher/job-names";
import { createPositionCache } from "#/lib/position-cache";
import type { StockfishOutput } from "#/lib/position-cache/types";
import type { PositionEval } from "#/providers/analysis-engine";
import { createStockfishWasmEngine } from "#/providers/stockfish-wasm-engine";

export { ANALYZE_POSITION_STOCKFISH };

/** Stockfish npm package version — matches the binary bundled in node_modules/stockfish */
export const STOCKFISH_VERSION = "stockfish-wasm-18.0.5";

/** Number of principal variations to fetch per position */
const MULTIPV = 5;

export function registerAnalyzePositionStockfishJob(boss: PgBoss) {
	boss.work<AnalyzePositionStockfishPayload>(
		ANALYZE_POSITION_STOCKFISH,
		{ pollingIntervalSeconds: 5, batchSize: 4 },
		async (jobs: Job<AnalyzePositionStockfishPayload>[]) => {
			for (const job of jobs) {
				await handleAnalyzePositionStockfish(job.data);
			}
		},
	);
}

async function handleAnalyzePositionStockfish(
	data: AnalyzePositionStockfishPayload,
): Promise<void> {
	const { fen, stockfishVersion, stockfishDepth } = data;
	console.log(
		`[analyze-position-stockfish] fen="${fen}" version=${stockfishVersion} depth=${stockfishDepth}`,
	);

	const db = drizzle(process.env.DATABASE_URL as string, { schema });
	const cache = createPositionCache(db);

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

	const engine = createStockfishWasmEngine({ multipv: MULTIPV });

	try {
		await engine.init();
		const result = await engine.analyzePosition(fen, stockfishDepth);
		const output = buildStockfishOutput(result);

		await cache.putStockfish(fen, stockfishVersion, stockfishDepth, output);

		console.log(
			`[analyze-position-stockfish] Cached fen="${fen}" (${output.topMoves.length} top moves)`,
		);
	} catch (err) {
		console.error(`[analyze-position-stockfish] Failed for fen="${fen}":`, err);
		throw err;
	} finally {
		await engine.destroy();
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
