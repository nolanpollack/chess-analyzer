/**
 * eval-rating.ts — Eval harness for Maia-2 rating prediction.
 *
 * HOW TO RUN
 * ----------
 * Prerequisites:
 *   1. DATABASE_URL must be set (the harness reads the position cache from Postgres).
 *   2. The worker must be running: `bun run worker`
 *      It will process `analyze-position-maia` and `analyze-position-stockfish` jobs.
 *   3. Obtain a Lichess monthly PGN dump (zstd-compressed) from:
 *      https://database.lichess.org/  (e.g. lichess_db_standard_rated_2024-01.pgn.zst)
 *
 * Basic run (smoke test — first 20 games):
 *   dotenv -e .env.local -- bun scripts/eval-rating.ts \
 *     --input /path/to/lichess.pgn.zst \
 *     --smoke 20
 *
 * Direct-batch mode (default, bypasses worker queue for Maia inference):
 *   Enabled by default. Use --no-direct-batch to route through the worker queue.
 *   With --direct-batch (default): Maia misses are fetched via POST /infer-batch;
 *   no worker job is enqueued for Maia. If --skip-stockfish is also set, the SF
 *   cache is not touched at all. If --skip-stockfish is omitted, SF is still
 *   populated via ensureAnalyzed.
 *
 * Full run:
 *   dotenv -e .env.local -- bun scripts/eval-rating.ts \
 *     --input /path/to/lichess.pgn.zst \
 *     --out bench/eval/my-run \
 *     --target-primary 5000 --target-per-band 100 --hard-cap 50000
 *
 * Epsilon sweep:
 *   dotenv -e .env.local -- bun scripts/eval-rating.ts \
 *     --input /path/to/lichess.pgn.zst --epsilon-sweep
 *
 * Prior sweep:
 *   dotenv -e .env.local -- bun scripts/eval-rating.ts \
 *     --input /path/to/lichess.pgn.zst --prior-sweep
 *
 * Output is written to bench/eval/<timestamp>/ by default:
 *   results.csv  — per-game-side predictions
 *   summary.json — aggregated metrics + sweep results
 */

import * as path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "#/db/schema";
import { DEFAULT_CONFIG } from "#/lib/eval-harness/config";
import type { EvalConfig, PriorName } from "#/lib/eval-harness/config";
import { writeCsv, writeSummary } from "#/lib/eval-harness/output";
import { runEval, runEvalSweep } from "#/lib/eval-harness/run-eval";
import { createPositionCache } from "#/lib/position-cache";

function parseArgs(): {
	config: EvalConfig;
	epsilonSweep: boolean;
	priorSweep: boolean;
} {
	const args = process.argv.slice(2);
	const get = (flag: string) => {
		const idx = args.indexOf(flag);
		return idx !== -1 ? args[idx + 1] : undefined;
	};
	const has = (flag: string) => args.includes(flag);

	const input = get("--input");
	if (!input) {
		console.error("Error: --input <path> is required");
		process.exit(1);
	}

	const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
	const outDir = get("--out") ?? path.join("bench", "eval", timestamp);

	const epsilonSweep = has("--epsilon-sweep");
	const priorSweep = has("--prior-sweep");

	const smokeArg = get("--smoke");
	const smokeN = smokeArg ? parseInt(smokeArg, 10) : null;

	const config: EvalConfig = {
		...DEFAULT_CONFIG,
		input,
		outDir,
		epsilon: get("--epsilon")
			? parseFloat(get("--epsilon")!)
			: DEFAULT_CONFIG.epsilon,
		prior: (get("--prior") ?? DEFAULT_CONFIG.prior) as PriorName,
		targetPrimary: get("--target-primary")
			? parseInt(get("--target-primary")!, 10)
			: DEFAULT_CONFIG.targetPrimary,
		targetPerBand: get("--target-per-band")
			? parseInt(get("--target-per-band")!, 10)
			: DEFAULT_CONFIG.targetPerBand,
		hardCap: get("--hard-cap")
			? parseInt(get("--hard-cap")!, 10)
			: DEFAULT_CONFIG.hardCap,
		smokeN,
		skipStockfish: has("--skip-stockfish"),
		// --no-direct-batch disables the direct batch path; default is enabled
		directBatch: !has("--no-direct-batch"),
	};

	return { config, epsilonSweep, priorSweep };
}

const EPSILON_SWEEP_VALUES = [1e-3, 1e-4, 1e-5, 1e-6, 1e-7];

const PRIOR_SWEEP_VALUES: PriorName[] = [
	"uniform",
	"lichess-empirical",
	{ gaussian: { mean: 1500, std: 200 } },
	{ gaussian: { mean: 1500, std: 400 } },
	{ gaussian: { mean: 1500, std: 500 } },
	{ gaussian: { mean: 1500, std: 600 } },
	{ gaussian: { mean: 1500, std: 800 } },
	{ gaussian: { mean: 1550, std: 500 } },
	{ gaussian: { mean: 1600, std: 400 } },
	{ gaussian: { mean: 1600, std: 500 } },
];

async function main() {
	const { config, epsilonSweep, priorSweep } = parseArgs();

	const databaseUrl = process.env["DATABASE_URL"];
	if (!databaseUrl) {
		console.error("Error: DATABASE_URL environment variable is required");
		process.exit(1);
	}

	const pool = new pg.Pool({ connectionString: databaseUrl });
	const db = drizzle(pool, { schema });
	const cache = createPositionCache(db);

	try {
		if (epsilonSweep || priorSweep) {
			const epsilons = epsilonSweep ? EPSILON_SWEEP_VALUES : [config.epsilon];
			const priors = priorSweep ? PRIOR_SWEEP_VALUES : [config.prior];

			const { rows, report } = await runEvalSweep(
				config,
				cache,
				epsilons,
				priors,
			);
			await writeCsv(config.outDir, rows);
			await writeSummary(config.outDir, report);
		} else {
			const { rows, report } = await runEval(config, cache);
			await writeCsv(config.outDir, rows);
			await writeSummary(config.outDir, report);
		}

		console.log(`Output written to: ${config.outDir}`);
	} finally {
		await pool.end();
	}
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
