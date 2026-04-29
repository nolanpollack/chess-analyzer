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
};

export const DEFAULT_CONFIG: Omit<EvalConfig, "input" | "outDir"> = {
	epsilon: 1e-6,
	prior: "uniform",
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
};
