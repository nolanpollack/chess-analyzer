/**
 * Phase 3 evaluation: LightGBM regression for ELO prediction.
 *
 * Compares four models on the same train/test split:
 *   - baseline:    univariate linear regression on lichess accuracy alone
 *   - multivariate: Phase 2 full OLS (re-fit on same train set)
 *   - lgbm:         Phase 3 LightGBM (pre-trained, loaded from JSON)
 *
 * Usage:
 *   bun scripts/eval-phase3.ts [--cache <file.jsonl>] [--model bench/phase3-model.json] [--split 0.7]
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
import { type LgbmModel, loadLgbmModel, predictLgbm } from "#/lib/scoring/lgbm-inference";

// ── CLI args ──────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function argValue(flag: string): string | undefined {
	const idx = argv.indexOf(flag);
	return idx !== -1 ? argv[idx + 1] : undefined;
}

const CACHE_PATH =
	argValue("--cache") ??
	"bench/cache/lichess_db_standard_rated_2026-03.jsonl";
const MODEL_PATH = argValue("--model") ?? "bench/phase3-model.json";
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

// ── Load LightGBM model ───────────────────────────────────────────────────────

function loadModel(path: string): LgbmModel {
	if (!existsSync(path)) {
		console.error(`Model file not found: ${path}`);
		process.exit(1);
	}
	const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
	return loadLgbmModel(raw);
}

// ── Deterministic shuffle (seeded LCG, same seed as eval-phase1/2.ts) ─────────

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
	return TC_CLASSES.map((c) => (c === tc ? 1 : 0));
}

// ── Feature vector builders ───────────────────────────────────────────────────

// Feature order must match FEATURE_NAMES in train-phase3.py exactly.
// [lichessAccuracy, accuracyOnHighComplexity, accuracyOnLowComplexity,
//  blunderRate, inaccuracyRate, meanCpl, moveCount,
//  meanTimeFractionUsed, blunderRateUnderPressure, hasTimeData,
//  tc_bullet, tc_blitz, tc_rapid, tc_classical, tc_correspondence]

export const LGBM_FEATURE_NAMES = [
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
] as const;

const FEATURE_NAMES_MULTIVARIATE = [...LGBM_FEATURE_NAMES];
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

function buildBaselineFeatureVector(f: GameFeatures): number[] {
	return [f.lichessAccuracy];
}

// ── Data point ────────────────────────────────────────────────────────────────

type DataPoint = {
	features: GameFeatures;
	elo: number;
	tcClass: string;
};

function buildDataPoints(games: CachedGame[]): DataPoint[] {
	const points: DataPoint[] = [];
	for (const game of games) {
		for (const color of ["white", "black"] as const) {
			const elo = color === "white" ? game.whiteElo : game.blackElo;
			const features = extractGameFeatures(game, color);
			if (!features) continue;
			points.push({ features, elo, tcClass: game.timeControlClass });
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

// ── Feature importance from model ─────────────────────────────────────────────

function computeFeatureImportance(model: LgbmModel): Array<{ name: string; splits: number }> {
	const splitCounts = new Map<number, number>();

	function walkForImportance(node: unknown): void {
		const n = node as Record<string, unknown>;
		if (!n || n["kind"] === "leaf") return;
		if (n["kind"] === "split") {
			const fi = n["featureIdx"] as number;
			splitCounts.set(fi, (splitCounts.get(fi) ?? 0) + 1);
			walkForImportance(n["left"]);
			walkForImportance(n["right"]);
		}
	}

	for (const tree of model.trees) {
		walkForImportance(tree);
	}

	return model.featureNames
		.map((name, idx) => ({ name, splits: splitCounts.get(idx) ?? 0 }))
		.sort((a, b) => b.splits - a.splits);
}

// ── Model fitting ─────────────────────────────────────────────────────────────

function fitOLSModels(trainPoints: DataPoint[]): {
	baseline: LinearModel;
	multivariate: LinearModel;
} {
	const baseX = trainPoints.map((p) => buildBaselineFeatureVector(p.features));
	const fullX = trainPoints.map((p) => buildFullFeatureVector(p.features));
	const y = trainPoints.map((p) => p.elo);
	return {
		baseline: fitOLS(baseX, y, FEATURE_NAMES_BASELINE),
		multivariate: fitOLS(fullX, y, FEATURE_NAMES_MULTIVARIATE),
	};
}

// ── Test row ──────────────────────────────────────────────────────────────────

type TestRow = {
	baselinePred: number;
	multivariatePred: number;
	lgbmPred: number;
	actual: number;
	tcClass: string;
};

function buildTestRows(
	testPoints: DataPoint[],
	olsModels: ReturnType<typeof fitOLSModels>,
	lgbmModel: LgbmModel,
): TestRow[] {
	return testPoints.map((p) => ({
		baselinePred: predict(olsModels.baseline, buildBaselineFeatureVector(p.features)),
		multivariatePred: predict(olsModels.multivariate, buildFullFeatureVector(p.features)),
		lgbmPred: predictLgbm(lgbmModel, buildFullFeatureVector(p.features)),
		actual: p.elo,
		tcClass: p.tcClass,
	}));
}

// ── Per-TC table ──────────────────────────────────────────────────────────────

function printPerTCTable(rows: TestRow[]): void {
	const tcGroups = new Map<string, TestRow[]>();
	for (const r of rows) {
		if (!tcGroups.has(r.tcClass)) tcGroups.set(r.tcClass, []);
		tcGroups.get(r.tcClass)!.push(r);
	}

	const header = `${pad("TC", 14, true)}  ${pad("n", 5)}  ${pad("Base MAE", 8)}  ${pad("Base R²", 7)}  ${pad("OLS MAE", 7)}  ${pad("OLS R²", 6)}  ${pad("LGBM MAE", 8)}  ${pad("LGBM R²", 7)}  ${pad("ΔMAE(LGBM vs Base)", 18)}  ${pad("ΔMAE(LGBM vs OLS)", 17)}`;
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
		const mv = computeMetrics(g.map((r) => ({ predicted: r.multivariatePred, actual: r.actual })));
		const lg = computeMetrics(g.map((r) => ({ predicted: r.lgbmPred, actual: r.actual })));
		console.log(
			`${pad(tc, 14, true)}  ${pad(bm.n, 5)}  ${pad(fmtMAE(bm.mae), 8)}  ${pad(fmtR2(bm.r2), 7)}  ${pad(fmtMAE(mv.mae), 7)}  ${pad(fmtR2(mv.r2), 6)}  ${pad(fmtMAE(lg.mae), 8)}  ${pad(fmtR2(lg.r2), 7)}  ${pad(fmtDelta(bm.mae, lg.mae), 18)}  ${pad(fmtDelta(mv.mae, lg.mae), 17)}`,
		);
	}

	const bm = computeMetrics(rows.map((r) => ({ predicted: r.baselinePred, actual: r.actual })));
	const mv = computeMetrics(rows.map((r) => ({ predicted: r.multivariatePred, actual: r.actual })));
	const lg = computeMetrics(rows.map((r) => ({ predicted: r.lgbmPred, actual: r.actual })));
	console.log(divider);
	console.log(
		`${"overall".padEnd(14)}  ${pad(bm.n, 5)}  ${pad(fmtMAE(bm.mae), 8)}  ${pad(fmtR2(bm.r2), 7)}  ${pad(fmtMAE(mv.mae), 7)}  ${pad(fmtR2(mv.r2), 6)}  ${pad(fmtMAE(lg.mae), 8)}  ${pad(fmtR2(lg.r2), 7)}  ${pad(fmtDelta(bm.mae, lg.mae), 18)}  ${pad(fmtDelta(mv.mae, lg.mae), 17)}`,
	);
	console.log();
}

// ── Per-band table ────────────────────────────────────────────────────────────

function printPerBandTable(rows: TestRow[]): void {
	const bandOrder = ["≤1200", "1200-1600", "1600-2000", "2000+"];
	const header = `${pad("Band", 12, true)}  ${pad("n", 5)}  ${pad("Base MAE", 8)}  ${pad("OLS MAE", 7)}  ${pad("LGBM MAE", 8)}  ${pad("ΔMAE(LGBM vs Base)", 18)}  ${pad("ΔMAE(LGBM vs OLS)", 17)}`;
	console.log("Per rating band (test set):");
	console.log("─".repeat(header.length));
	console.log(header);
	console.log("─".repeat(header.length));

	for (const band of bandOrder) {
		const g = rows.filter((r) => ratingBandLabel(r.actual) === band);
		if (g.length < 5) continue;
		const bm = computeMetrics(g.map((r) => ({ predicted: r.baselinePred, actual: r.actual })));
		const mv = computeMetrics(g.map((r) => ({ predicted: r.multivariatePred, actual: r.actual })));
		const lg = computeMetrics(g.map((r) => ({ predicted: r.lgbmPred, actual: r.actual })));
		console.log(
			`${pad(band, 12, true)}  ${pad(bm.n, 5)}  ${pad(fmtMAE(bm.mae), 8)}  ${pad(fmtMAE(mv.mae), 7)}  ${pad(fmtMAE(lg.mae), 8)}  ${pad(fmtDelta(bm.mae, lg.mae), 18)}  ${pad(fmtDelta(mv.mae, lg.mae), 17)}`,
		);
	}
	console.log();
}

// ── Entry point ───────────────────────────────────────────────────────────────

const allGames = loadCache(CACHE_PATH);
const lgbmModel = loadModel(MODEL_PATH);

const shuffled = seededShuffle(allGames, 42);
const splitIdx = Math.floor(shuffled.length * TRAIN_FRACTION);
const trainGames = shuffled.slice(0, splitIdx);
const testGames = shuffled.slice(splitIdx);

console.log(
	`Phase 3 evaluation — cache=${CACHE_PATH}, n_train=${trainGames.length}, n_test=${testGames.length}`,
);
console.log(`Model: ${MODEL_PATH} (${lgbmModel.trees.length} trees, ${lgbmModel.featureNames.length} features)`);
console.log();

const trainPoints = buildDataPoints(trainGames);
const testPoints = buildDataPoints(testGames);

console.log(`Training data points: ${trainPoints.length} (from ${trainGames.length} games)`);
console.log(`Test data points:     ${testPoints.length} (from ${testGames.length} games)`);
console.log();

const olsModels = fitOLSModels(trainPoints);

console.log(`Train R² — baseline: ${olsModels.baseline.trainR2.toFixed(3)}  |  OLS multivariate: ${olsModels.multivariate.trainR2.toFixed(3)}`);
console.log();

const testRows = buildTestRows(testPoints, olsModels, lgbmModel);

const bm = computeMetrics(testRows.map((r) => ({ predicted: r.baselinePred, actual: r.actual })));
const mv = computeMetrics(testRows.map((r) => ({ predicted: r.multivariatePred, actual: r.actual })));
const lg = computeMetrics(testRows.map((r) => ({ predicted: r.lgbmPred, actual: r.actual })));

console.log("Overall test metrics:");
console.log(`  ${"Model".padEnd(25)}  ${"MAE".padStart(8)}  ${"R²".padStart(8)}  ${"ΔMAE vs Base".padStart(12)}  ${"ΔMAE vs OLS".padStart(11)}`);
console.log(`  ${"─".repeat(25)}  ${"─".repeat(8)}  ${"─".repeat(8)}  ${"─".repeat(12)}  ${"─".repeat(11)}`);
console.log(`  ${"Baseline (accuracy only)".padEnd(25)}  ${pad(fmtMAE(bm.mae), 8)}  ${pad(fmtR2(bm.r2), 8)}`);
console.log(`  ${"Phase 2 OLS multivariate".padEnd(25)}  ${pad(fmtMAE(mv.mae), 8)}  ${pad(fmtR2(mv.r2), 8)}  ${pad(fmtDelta(bm.mae, mv.mae), 12)}`);
console.log(`  ${"Phase 3 LightGBM".padEnd(25)}  ${pad(fmtMAE(lg.mae), 8)}  ${pad(fmtR2(lg.r2), 8)}  ${pad(fmtDelta(bm.mae, lg.mae), 12)}  ${pad(fmtDelta(mv.mae, lg.mae), 11)}`);
console.log();

printPerTCTable(testRows);
printPerBandTable(testRows);

// ── Feature importance ────────────────────────────────────────────────────────

const importance = computeFeatureImportance(lgbmModel);
console.log("LightGBM feature importance (split count across all trees):");
console.log(`  ${"Feature".padEnd(35)}  ${"Splits".padStart(8)}`);
console.log(`  ${"─".repeat(35)}  ${"─".repeat(8)}`);
for (const { name, splits } of importance) {
	if (splits > 0) {
		console.log(`  ${name.padEnd(35)}  ${pad(splits, 8)}`);
	}
}
console.log();

// ── JSON dump ─────────────────────────────────────────────────────────────────

const outData = {
	generatedAt: new Date().toISOString(),
	cacheFile: CACHE_PATH,
	modelFile: MODEL_PATH,
	nTrain: trainGames.length,
	nTest: testGames.length,
	trainFraction: TRAIN_FRACTION,
	trainDataPoints: trainPoints.length,
	testDataPoints: testPoints.length,
	lgbmTrees: lgbmModel.trees.length,
	overallMetrics: {
		baseline: bm,
		multivariateOLS: mv,
		lgbm: lg,
	},
};

const outPath = "bench/phase3-results.json";
writeFileSync(outPath, `${JSON.stringify(outData, null, "\t")}\n`, "utf-8");
console.log(`Results written to ${outPath}`);

process.exit(0);
