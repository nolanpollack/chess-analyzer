import type { AnalysisVersions } from "#/lib/analysis-dispatcher";

export type PriorName =
	| "uniform"
	| "lichess-empirical"
	| { gaussian: { mean: number; std: number } };

export type EvalConfig = {
	input: string;
	outDir: string;
	epsilon: number;
	prior: PriorName;
	targetPrimary: number;
	targetPerBand: number;
	hardCap: number;
	smokeN: number | null;
	versions: AnalysisVersions;
	waitTimeoutMs: number;
	/**
	 * When true, skip Stockfish ensure + polling entirely. Maia only.
	 * Useful for smoke runs and eval harness benchmarks where SF output
	 * is not consumed by the rating aggregator. Default false.
	 */
	skipStockfish: boolean;
	/**
	 * When true (default), bypass the worker queue for Maia inference and call
	 * /infer-batch directly for cache misses. Set to false to use the worker
	 * queue path (production flow). Default true.
	 */
	directBatch: boolean;
};

export const DEFAULT_CONFIG: Omit<EvalConfig, "input" | "outDir"> = {
	epsilon: 1e-6,
	// Tuned via prior sweep (see .claude/rules/ratings.md). Best overall MAE on
	// the natural Lichess distribution; modal-range optimised, tails degraded.
	prior: { gaussian: { mean: 1500, std: 400 } },
	targetPrimary: 5000,
	targetPerBand: 100,
	hardCap: 50_000,
	smokeN: null,
	versions: {
		maiaVersion: "maia2-rapid-v1.0",
		stockfishVersion: "sf18",
		stockfishDepth: 18,
	},
	waitTimeoutMs: 600_000,
	skipStockfish: false,
	directBatch: true,
};
