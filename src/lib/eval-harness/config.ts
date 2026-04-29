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
};

export const DEFAULT_CONFIG: Omit<EvalConfig, "input" | "outDir"> = {
	epsilon: 1e-6,
	prior: "uniform",
	targetPrimary: 5000,
	targetPerBand: 100,
	hardCap: 50_000,
	smokeN: null,
	versions: {
		maiaVersion: "maia-1500",
		stockfishVersion: "sf18",
		stockfishDepth: 18,
	},
	waitTimeoutMs: 600_000,
};
