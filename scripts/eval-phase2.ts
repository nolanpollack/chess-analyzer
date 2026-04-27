/**
 * Phase 2 evaluation: multivariate OLS regression for ELO prediction.
 *
 * Compares three models on the same train/test split:
 *   - baseline:    univariate linear regression on lichess accuracy alone
 *   - multivariate-no-complexity: OLS without complexity-partition features
 *   - multivariate: full OLS including complexity-partition features
 *
 * Usage:
 *   bun scripts/eval-phase2.ts [--cache <file.jsonl>] [--split 0.7]
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
	type GameFeatures,
	extractGameFeatures,
} from "#/lib/scoring/game-features";
import {
	type LinearModel,
	fitOLS,
	predict,
} from "#/lib/scoring/multivariate-regression";
import { computeGameAccuracy } from "#/lib/scoring/game-accuracy";

// ── CLI args ──────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function argValue(flag: string): string | undefined {
	const idx = argv.indexOf(flag);
	return idx !== -1 ? argv[idx + 1] : undefined;
}

const CACHE_PATH =
	argValue("--cache") ??
	"bench/cache/lichess_db_standard_rated_2026-03.jsonl";
const TRAIN_FRACTION = Number(argValue("--split") ?? "0.7");

// ── Types ─────────────────────────────────────────────────────────────────────

type CachedMove = {
	ply: number;
	isWhite: boolean;
	san: string;
	uci: string;
	fenBefore: string;
	fenAfter: string;
	evalBeforeCp: number;
	evalAfterCp: number;
	pv2BeforeCp: number | null;
	bestMoveUci: string;
	bestMoveSan: string;
	complexity: number;
	accuracy: number;
	clockMs: number | null;
};

type CachedGame = {
	gameId: string;
	whiteElo: number;
	blackElo: number;
	timeControl: string;
	timeControlClass: string;
	result: string;
	moves: CachedMove[];
};

// ── Load cache ────────────────────────────────────────────────────────────────

function loadCache(path: string): CachedGame[] {
	if (!existsSync(path)) {
		console.error(`Cache file not found: ${path}`);
		process.exit(1);
	}
	const lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);
	return lines.map((l) => JSON.parse(l) as CachedGame);
}

// ── Deterministic shuffle (seeded LCG, same seed as eval-phase1.ts) ──────────

function seededShuffle<T>(arr: T[], seed = 42): T[] {
	const out = [...arr];
	let s = seed;
	const rand = () => {
		s = (s * 1664525 + 1013904223) & 0xffffffff;
		return (s >>> 0) / 0x100000000;
	};
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

// ── Time control classes ──────────────────────────────────────────────────────

const TC_CLASSES = ["bullet", "blitz", "rapid", "classical", "correspondence"] as const;
type TcClass = (typeof TC_CLASSES)[number];

function oneHotTC(tc: string): number[] {
	// 5 binary columns; one per TC class
	return TC_CLASSES.map((c) => (c === tc ? 1 : 0));
}

// ── Feature vector builders ───────────────────────────────────────────────────

// NOTE: opponentRating is excluded — Lichess matchmaking pairs players within
// ~100 ELO, so opponentRating ≈ playerRating + N(0, 100), making it a direct
// label leak. The goal of this estimator is to predict skill from MOVES, not
// matchmaking metadata.
const FEATURE_NAMES_MULTIVARIATE = [
	"lichessAccuracy",
	"accuracyOnHighComplexity",
	"accuracyOnLowComplexity",
	"blunderRate",
	"inaccuracyRate",
	"meanCpl",
	"moveCount",
	"meanTimeFractionUsed",
	"blunderRateUnderPressure",
	"hasTimeData",
	...TC_CLASSES.map((tc) => `tc_${tc}`),
];

const FEATURE_NAMES_NO_COMPLEXITY = [
	"lichessAccuracy",
	"blunderRate",
	"inaccuracyRate",
	"meanCpl",
	"moveCount",
	"meanTimeFractionUsed",
	"blunderRateUnderPressure",
	"hasTimeData",
	...TC_CLASSES.map((tc) => `tc_${tc}`),
];

const FEATURE_NAMES_BASELINE = ["lichessAccuracy"];

function buildFullFeatureVector(f: GameFeatures): number[] {
	const hasTime = f.meanTimeFractionUsed !== null ? 1 : 0;
	return [
		f.lichessAccuracy,
		f.accuracyOnHighComplexity,
		f.accuracyOnLowComplexity,
		f.blunderRate,
		f.inaccuracyRate,
		f.meanCpl,
		f.moveCount,
		f.meanTimeFractionUsed ?? 0,
		f.blunderRateUnderPressure ?? 0,
		hasTime,
		...oneHotTC(f.timeControlClass),
	];
}

function buildNoComplexityFeatureVector(f: GameFeatures): number[] {
	const hasTime = f.meanTimeFractionUsed !== null ? 1 : 0;
	return [
		f.lichessAccuracy,
		f.blunderRate,
		f.inaccuracyRate,
		f.meanCpl,
		f.moveCount,
		f.meanTimeFractionUsed ?? 0,
		f.blunderRateUnderPressure ?? 0,
		hasTime,
		...oneHotTC(f.timeControlClass),
	];
}

function buildBaselineFeatureVector(f: GameFeatures): number[] {
	return [f.lichessAccuracy];
}

// ── Baseline lichess accuracy (from eval-phase1 formula) ──────────────────────

function baselineLichessAccuracy(
	game: CachedGame,
	color: "white" | "black",
): number | null {
	const moves = game.moves.map((m) => ({
		evalBefore: m.evalBeforeCp,
		evalAfter: m.evalAfterCp,
		isWhite: m.isWhite,
	}));
	const acc = computeGameAccuracy(moves);
	if (!acc) return null;
	return color === "white" ? acc.white : acc.black;
}

// ── Data point ────────────────────────────────────────────────────────────────

type DataPoint = {
	features: GameFeatures;
	elo: number;
	tcClass: string;
	lichessAccuracy: number;
};

function buildDataPoints(games: CachedGame[]): DataPoint[] {
	const points: DataPoint[] = [];
	for (const game of games) {
		for (const color of ["white", "black"] as const) {
			const elo = color === "white" ? game.whiteElo : game.blackElo;
			const features = extractGameFeatures(game, color);
			if (!features) continue;
			points.push({
				features,
				elo,
				tcClass: game.timeControlClass,
				lichessAccuracy: features.lichessAccuracy,
			});
		}
	}
	return points;
}

// ── Metrics ───────────────────────────────────────────────────────────────────

type Metrics = { mae: number; r2: number; n: number };

function computeMetrics(
	pairs: Array<{ predicted: number; actual: number }>,
): Metrics {
	const n = pairs.length;
	if (n === 0) return { mae: 0, r2: 0, n: 0 };
	const mae = pairs.reduce((s, p) => s + Math.abs(p.actual - p.predicted), 0) / n;
	const mean = pairs.reduce((s, p) => s + p.actual, 0) / n;
	const ssTot = pairs.reduce((s, p) => s + (p.actual - mean) ** 2, 0);
	const ssRes = pairs.reduce((s, p) => s + (p.actual - p.predicted) ** 2, 0);
	return { mae, r2: ssTot > 0 ? 1 - ssRes / ssTot : 0, n };
}

// ── Rating bands ──────────────────────────────────────────────────────────────

function ratingBandLabel(elo: number): string {
	if (elo <= 1200) return "≤1200";
	if (elo <= 1600) return "1200-1600";
	if (elo <= 2000) return "1600-2000";
	return "2000+";
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function pad(s: string | number, n: number, right = false): string {
	const str = String(s);
	return right ? str.padEnd(n) : str.padStart(n);
}

function fmtMAE(mae: number): string {
	return Math.round(mae).toString();
}

function fmtR2(r2: number): string {
	return r2.toFixed(3);
}

function fmtDelta(base: number, candidate: number): string {
	const d = Math.round(candidate - base);
	const sign = d >= 0 ? "+" : "";
	return `${sign}${d}`;
}

// ── Coefficient interpretation ────────────────────────────────────────────────

function printCoefficients(model: LinearModel): void {
	console.log("Fitted coefficients (multivariate model):");
	console.log(`  ${"Feature".padEnd(35)}  ${"Coefficient".padStart(14)}`);
	console.log(`  ${"─".repeat(35)}  ${"─".repeat(14)}`);
	console.log(`  ${"(intercept)".padEnd(35)}  ${pad(model.coefficients[0].toFixed(2), 14)}`);
	for (let i = 0; i < model.featureNames.length; i++) {
		const coef = model.coefficients[i + 1];
		const name = model.featureNames[i];
		console.log(`  ${name.padEnd(35)}  ${pad(coef.toFixed(4), 14)}`);
	}
	console.log();
}

// ── Main evaluation logic ─────────────────────────────────────────────────────

function fitModels(trainPoints: DataPoint[]): {
	baseline: LinearModel;
	multivariate: LinearModel;
	multivariateNoComplexity: LinearModel;
} {
	const baseX = trainPoints.map((p) => buildBaselineFeatureVector(p.features));
	const fullX = trainPoints.map((p) => buildFullFeatureVector(p.features));
	const noComplexX = trainPoints.map((p) =>
		buildNoComplexityFeatureVector(p.features),
	);
	const y = trainPoints.map((p) => p.elo);

	return {
		baseline: fitOLS(baseX, y, FEATURE_NAMES_BASELINE),
		multivariate: fitOLS(fullX, y, FEATURE_NAMES_MULTIVARIATE),
		multivariateNoComplexity: fitOLS(
			noComplexX,
			y,
			FEATURE_NAMES_NO_COMPLEXITY,
		),
	};
}

type TestRow = {
	baselinePred: number;
	multivariatePred: number;
	multivariateNoComplexityPred: number;
	actual: number;
	tcClass: string;
};

function buildTestRows(
	testPoints: DataPoint[],
	models: ReturnType<typeof fitModels>,
): TestRow[] {
	return testPoints.map((p) => ({
		baselinePred: predict(models.baseline, buildBaselineFeatureVector(p.features)),
		multivariatePred: predict(
			models.multivariate,
			buildFullFeatureVector(p.features),
		),
		multivariateNoComplexityPred: predict(
			models.multivariateNoComplexity,
			buildNoComplexityFeatureVector(p.features),
		),
		actual: p.elo,
		tcClass: p.tcClass,
	}));
}

function printPerTCTable(rows: TestRow[]): void {
	const tcGroups = new Map<string, TestRow[]>();
	for (const r of rows) {
		if (!tcGroups.has(r.tcClass)) tcGroups.set(r.tcClass, []);
		tcGroups.get(r.tcClass)!.push(r);
	}

	const header = `${pad("TC", 14, true)}  ${pad("n", 5)}  ${pad("Base MAE", 8)}  ${pad("Base R²", 7)}  ${pad("MV-noC MAE", 10)}  ${pad("MV-noC R²", 9)}  ${pad("MV MAE", 6)}  ${pad("MV R²", 5)}  ${pad("ΔMAE(MV vs Base)", 16)}`;
	const divider = "─".repeat(header.length);
	console.log("Per time-control comparison (test set):");
	console.log(divider);
	console.log(header);
	console.log(divider);

	const sortedTCs = [...tcGroups.keys()].sort();
	for (const tc of sortedTCs) {
		const g = tcGroups.get(tc)!;
		if (g.length < 5) continue;
		const bm = computeMetrics(g.map((r) => ({ predicted: r.baselinePred, actual: r.actual })));
		const nc = computeMetrics(g.map((r) => ({ predicted: r.multivariateNoComplexityPred, actual: r.actual })));
		const mv = computeMetrics(g.map((r) => ({ predicted: r.multivariatePred, actual: r.actual })));
		console.log(
			`${pad(tc, 14, true)}  ${pad(bm.n, 5)}  ${pad(fmtMAE(bm.mae), 8)}  ${pad(fmtR2(bm.r2), 7)}  ${pad(fmtMAE(nc.mae), 10)}  ${pad(fmtR2(nc.r2), 9)}  ${pad(fmtMAE(mv.mae), 6)}  ${pad(fmtR2(mv.r2), 5)}  ${pad(fmtDelta(bm.mae, mv.mae), 16)}`,
		);
	}

	const bm = computeMetrics(rows.map((r) => ({ predicted: r.baselinePred, actual: r.actual })));
	const nc = computeMetrics(rows.map((r) => ({ predicted: r.multivariateNoComplexityPred, actual: r.actual })));
	const mv = computeMetrics(rows.map((r) => ({ predicted: r.multivariatePred, actual: r.actual })));
	console.log(divider);
	console.log(
		`${"overall".padEnd(14)}  ${pad(bm.n, 5)}  ${pad(fmtMAE(bm.mae), 8)}  ${pad(fmtR2(bm.r2), 7)}  ${pad(fmtMAE(nc.mae), 10)}  ${pad(fmtR2(nc.r2), 9)}  ${pad(fmtMAE(mv.mae), 6)}  ${pad(fmtR2(mv.r2), 5)}  ${pad(fmtDelta(bm.mae, mv.mae), 16)}`,
	);
	console.log();
}

function printPerBandTable(rows: TestRow[]): void {
	const bandOrder = ["≤1200", "1200-1600", "1600-2000", "2000+"];
	const header = `${pad("Band", 12, true)}  ${pad("n", 5)}  ${pad("Base MAE", 8)}  ${pad("MV-noC MAE", 10)}  ${pad("MV MAE", 6)}  ${pad("ΔMAE(MV vs Base)", 16)}`;
	console.log("Per rating band (test set):");
	console.log("─".repeat(header.length));
	console.log(header);
	console.log("─".repeat(header.length));

	for (const band of bandOrder) {
		const g = rows.filter((r) => ratingBandLabel(r.actual) === band);
		if (g.length < 5) continue;
		const bm = computeMetrics(g.map((r) => ({ predicted: r.baselinePred, actual: r.actual })));
		const nc = computeMetrics(g.map((r) => ({ predicted: r.multivariateNoComplexityPred, actual: r.actual })));
		const mv = computeMetrics(g.map((r) => ({ predicted: r.multivariatePred, actual: r.actual })));
		console.log(
			`${pad(band, 12, true)}  ${pad(bm.n, 5)}  ${pad(fmtMAE(bm.mae), 8)}  ${pad(fmtMAE(nc.mae), 10)}  ${pad(fmtMAE(mv.mae), 6)}  ${pad(fmtDelta(bm.mae, mv.mae), 16)}`,
		);
	}
	console.log();
}

// ── Entry point ───────────────────────────────────────────────────────────────

const allGames = loadCache(CACHE_PATH);
const shuffled = seededShuffle(allGames, 42);
const splitIdx = Math.floor(shuffled.length * TRAIN_FRACTION);
const trainGames = shuffled.slice(0, splitIdx);
const testGames = shuffled.slice(splitIdx);

console.log(
	`Phase 2 evaluation — cache=${CACHE_PATH}, n_train=${trainGames.length}, n_test=${testGames.length}`,
);
console.log();

const trainPoints = buildDataPoints(trainGames);
const testPoints = buildDataPoints(testGames);

console.log(`Training data points: ${trainPoints.length} (from ${trainGames.length} games)`);
console.log(`Test data points:     ${testPoints.length} (from ${testGames.length} games)`);
console.log();

const models = fitModels(trainPoints);

console.log(`Train R² — baseline: ${models.baseline.trainR2.toFixed(3)}  |  MV-no-complexity: ${models.multivariateNoComplexity.trainR2.toFixed(3)}  |  multivariate: ${models.multivariate.trainR2.toFixed(3)}`);
console.log();

const testRows = buildTestRows(testPoints, models);

printPerTCTable(testRows);
printPerBandTable(testRows);
printCoefficients(models.multivariate);

// ── JSON dump ─────────────────────────────────────────────────────────────────

const bm = computeMetrics(testRows.map((r) => ({ predicted: r.baselinePred, actual: r.actual })));
const nc = computeMetrics(testRows.map((r) => ({ predicted: r.multivariateNoComplexityPred, actual: r.actual })));
const mv = computeMetrics(testRows.map((r) => ({ predicted: r.multivariatePred, actual: r.actual })));

const outData = {
	generatedAt: new Date().toISOString(),
	cacheFile: CACHE_PATH,
	nTrain: trainGames.length,
	nTest: testGames.length,
	trainFraction: TRAIN_FRACTION,
	trainDataPoints: trainPoints.length,
	testDataPoints: testPoints.length,
	models: {
		baseline: {
			coefficients: models.baseline.coefficients,
			featureNames: models.baseline.featureNames,
			trainR2: models.baseline.trainR2,
		},
		multivariateNoComplexity: {
			coefficients: models.multivariateNoComplexity.coefficients,
			featureNames: models.multivariateNoComplexity.featureNames,
			trainR2: models.multivariateNoComplexity.trainR2,
		},
		multivariate: {
			coefficients: models.multivariate.coefficients,
			featureNames: models.multivariate.featureNames,
			trainR2: models.multivariate.trainR2,
		},
	},
	overallMetrics: {
		baseline: bm,
		multivariateNoComplexity: nc,
		multivariate: mv,
	},
};

const outPath = "bench/phase2-results.json";
writeFileSync(outPath, `${JSON.stringify(outData, null, "\t")}\n`, "utf-8");
console.log(`Results written to ${outPath}`);

process.exit(0);
