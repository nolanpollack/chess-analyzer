/**
 * Phase 1 evaluation: compare baseline (lichess game accuracy) vs
 * complexity-weighted accuracy for ELO prediction.
 *
 * Reads from a pre-built JSONL cache (output of build-eval-cache.ts),
 * splits into train/test, fits per-time-control linear regressions for
 * both methods on the train split, evaluates on the test split, and
 * prints a comparison table.
 *
 * Usage:
 *   bun scripts/eval-phase1.ts [--cache bench/cache/<file>.jsonl] [--split 0.7]
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { computeGameAccuracy } from "#/lib/scoring/game-accuracy";
import { computeWeightedAccuracy } from "#/lib/scoring/weighted-accuracy";

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

// ── Types from build-eval-cache.ts (reproduced to avoid shared import) ────────

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
		console.error("Run: bun scripts/build-eval-cache.ts <url> first.");
		process.exit(1);
	}
	const lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);
	return lines.map((l) => JSON.parse(l) as CachedGame);
}

// ── Deterministic shuffle (seeded LCG) ───────────────────────────────────────

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

// ── Accuracy computations ─────────────────────────────────────────────────────

type ColorAccuracy = { white: number; black: number } | null;

function baselineAccuracy(game: CachedGame): ColorAccuracy {
	const moves = game.moves.map((m) => ({
		evalBefore: m.evalBeforeCp,
		evalAfter: m.evalAfterCp,
		isWhite: m.isWhite,
	}));
	return computeGameAccuracy(moves);
}

function phase1Accuracy(game: CachedGame): ColorAccuracy {
	const moves = game.moves.map((m) => ({
		accuracy: m.accuracy,
		complexity: m.complexity,
		isWhite: m.isWhite,
	}));
	return computeWeightedAccuracy(moves);
}

// ── Linear regression ─────────────────────────────────────────────────────────

type DataPoint = { accuracy: number; rating: number };

type Formula = { slope: number; offset: number; r2: number; n: number };

function linearRegression(points: DataPoint[]): Formula {
	const n = points.length;
	if (n < 2) return { slope: 40, offset: -1200, r2: 0, n };

	let sumX = 0;
	let sumY = 0;
	let sumXY = 0;
	let sumX2 = 0;
	for (const { accuracy: x, rating: y } of points) {
		sumX += x;
		sumY += y;
		sumXY += x * y;
		sumX2 += x * x;
	}
	const denom = n * sumX2 - sumX * sumX;
	const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
	const offset = (sumY - slope * sumX) / n;

	const meanY = sumY / n;
	let ssTot = 0;
	let ssRes = 0;
	for (const { accuracy: x, rating: y } of points) {
		ssTot += (y - meanY) ** 2;
		ssRes += (y - (slope * x + offset)) ** 2;
	}

	return { slope, offset, r2: ssTot > 0 ? 1 - ssRes / ssTot : 0, n };
}

function fitFormulas(
	points: DataPoint[],
	byTC: Map<string, DataPoint[]>,
): { overall: Formula; perTC: Map<string, Formula> } {
	const overall = linearRegression(points);
	const perTC = new Map<string, Formula>();
	for (const [tc, tcPoints] of byTC) {
		if (tcPoints.length >= 10) perTC.set(tc, linearRegression(tcPoints));
	}
	return { overall, perTC };
}

// ── Prediction & metrics ──────────────────────────────────────────────────────

function predict(
	accuracy: number,
	tc: string,
	formulas: { overall: Formula; perTC: Map<string, Formula> },
): number {
	const f = formulas.perTC.get(tc) ?? formulas.overall;
	return f.slope * accuracy + f.offset;
}

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
	const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
	return { mae, r2, n };
}

// ── Rating bands ──────────────────────────────────────────────────────────────

function ratingBandLabel(elo: number): string {
	if (elo <= 1200) return "≤1200";
	if (elo <= 1600) return "1200-1600";
	if (elo <= 2000) return "1600-2000";
	return "2000+";
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtR2(r2: number): string {
	return r2.toFixed(2);
}

function fmtMAE(mae: number): string {
	return Math.round(mae).toString();
}

function fmtDelta(a: number, b: number): string {
	const d = Math.round(b - a);
	const pct = a !== 0 ? (((b - a) / a) * 100).toFixed(1) : "—";
	return `${d >= 0 ? "+" : ""}${d} (${d >= 0 ? "+" : ""}${pct}%)`;
}

function pad(s: string | number, n: number, right = false): string {
	const str = String(s);
	return right ? str.padEnd(n) : str.padStart(n);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const allGames = loadCache(CACHE_PATH);
const shuffled = seededShuffle(allGames, 42);
const splitIdx = Math.floor(shuffled.length * TRAIN_FRACTION);
const trainGames = shuffled.slice(0, splitIdx);
const testGames = shuffled.slice(splitIdx);

console.log(
	`Phase 1 evaluation — cache=${CACHE_PATH}, n_train=${trainGames.length}, n_test=${testGames.length}`,
);
console.log();

// Build training data points for both methods
const trainBaseline: DataPoint[] = [];
const trainPhase1: DataPoint[] = [];
const trainByTC = { baseline: new Map<string, DataPoint[]>(), phase1: new Map<string, DataPoint[]>() };

for (const game of trainGames) {
	const base = baselineAccuracy(game);
	const p1 = phase1Accuracy(game);
	if (!base || !p1) continue;

	for (const [color, elo] of [
		["white", game.whiteElo],
		["black", game.blackElo],
	] as const) {
		const bAcc = color === "white" ? base.white : base.black;
		const p1Acc = color === "white" ? p1.white : p1.black;

		trainBaseline.push({ accuracy: bAcc, rating: elo });
		trainPhase1.push({ accuracy: p1Acc, rating: elo });

		const tc = game.timeControl;
		if (!trainByTC.baseline.has(tc)) trainByTC.baseline.set(tc, []);
		if (!trainByTC.phase1.has(tc)) trainByTC.phase1.set(tc, []);
		trainByTC.baseline.get(tc)!.push({ accuracy: bAcc, rating: elo });
		trainByTC.phase1.get(tc)!.push({ accuracy: p1Acc, rating: elo });
	}
}

const baselineFormulas = fitFormulas(trainBaseline, trainByTC.baseline);
const phase1Formulas = fitFormulas(trainPhase1, trainByTC.phase1);

// Evaluate on test set
type TestPair = { baseline: number; phase1: number; actual: number; tc: string; elo: number };
const testPairs: TestPair[] = [];

for (const game of testGames) {
	const base = baselineAccuracy(game);
	const p1 = phase1Accuracy(game);
	if (!base || !p1) continue;

	for (const [color, elo] of [
		["white", game.whiteElo],
		["black", game.blackElo],
	] as const) {
		const bAcc = color === "white" ? base.white : base.black;
		const p1Acc = color === "white" ? p1.white : p1.black;
		testPairs.push({
			baseline: predict(bAcc, game.timeControl, baselineFormulas),
			phase1: predict(p1Acc, game.timeControl, phase1Formulas),
			actual: elo,
			tc: game.timeControl,
			elo,
		});
	}
}

// Print per-time-control table
const tcGroups = new Map<string, TestPair[]>();
for (const p of testPairs) {
	if (!tcGroups.has(p.tc)) tcGroups.set(p.tc, []);
	tcGroups.get(p.tc)!.push(p);
}

const MIN_TC = 20;
const sortedTCs = [...tcGroups.keys()]
	.filter((tc) => (tcGroups.get(tc)?.length ?? 0) >= MIN_TC)
	.sort((a, b) => {
		const est = (tc: string) => {
			const m = tc.match(/^(\d+)\+(\d+)$/);
			return m ? Number(m[1]) + 40 * Number(m[2]) : 99999;
		};
		return est(a) - est(b);
	});

const header =
	`${"TC".padEnd(10)}  ${"n".padStart(5)}  ${"Baseline MAE".padStart(12)}  ${"Baseline R²".padStart(11)}  ${"Phase1 MAE".padStart(10)}  ${"Phase1 R²".padStart(9)}  ${"ΔMAE".padStart(16)}`;
const divider = "─".repeat(header.length);
console.log("Per time-control comparison (test set):");
console.log(divider);
console.log(header);
console.log(divider);

for (const tc of sortedTCs) {
	const pairs = tcGroups.get(tc)!;
	const bm = computeMetrics(pairs.map((p) => ({ predicted: p.baseline, actual: p.actual })));
	const pm = computeMetrics(pairs.map((p) => ({ predicted: p.phase1, actual: p.actual })));
	console.log(
		`${pad(tc, 10, true)}  ${pad(bm.n, 5)}  ${pad(fmtMAE(bm.mae), 12)}  ${pad(fmtR2(bm.r2), 11)}  ${pad(fmtMAE(pm.mae), 10)}  ${pad(fmtR2(pm.r2), 9)}  ${pad(fmtDelta(bm.mae, pm.mae), 16)}`,
	);
}

const overallB = computeMetrics(testPairs.map((p) => ({ predicted: p.baseline, actual: p.actual })));
const overallP = computeMetrics(testPairs.map((p) => ({ predicted: p.phase1, actual: p.actual })));
console.log(divider);
console.log(
	`${"overall".padEnd(10)}  ${pad(overallB.n, 5)}  ${pad(fmtMAE(overallB.mae), 12)}  ${pad(fmtR2(overallB.r2), 11)}  ${pad(fmtMAE(overallP.mae), 10)}  ${pad(fmtR2(overallP.r2), 9)}  ${pad(fmtDelta(overallB.mae, overallP.mae), 16)}`,
);

console.log();
console.log("Per rating band (overall, test set):");
const bandHeader =
	`${"Band".padEnd(12)}  ${"n".padStart(5)}  ${"Baseline MAE".padStart(12)}  ${"Phase1 MAE".padStart(10)}  ${"ΔMAE".padStart(12)}`;
console.log("─".repeat(bandHeader.length));
console.log(bandHeader);
console.log("─".repeat(bandHeader.length));

const bandOrder = ["≤1200", "1200-1600", "1600-2000", "2000+"];
for (const band of bandOrder) {
	const pairs = testPairs.filter((p) => ratingBandLabel(p.elo) === band);
	if (pairs.length < 5) continue;
	const bm = computeMetrics(pairs.map((p) => ({ predicted: p.baseline, actual: p.actual })));
	const pm = computeMetrics(pairs.map((p) => ({ predicted: p.phase1, actual: p.actual })));
	console.log(
		`${pad(band, 12, true)}  ${pad(bm.n, 5)}  ${pad(fmtMAE(bm.mae), 12)}  ${pad(fmtMAE(pm.mae), 10)}  ${pad(fmtDelta(bm.mae, pm.mae), 12)}`,
	);
}

// Dump JSON results
const outData = {
	generatedAt: new Date().toISOString(),
	cacheFile: CACHE_PATH,
	nTrain: trainGames.length,
	nTest: testGames.length,
	trainFraction: TRAIN_FRACTION,
	baselineFormulas: {
		overall: baselineFormulas.overall,
		perTC: Object.fromEntries(baselineFormulas.perTC),
	},
	phase1Formulas: {
		overall: phase1Formulas.overall,
		perTC: Object.fromEntries(phase1Formulas.perTC),
	},
	overallMetrics: {
		baseline: overallB,
		phase1: overallP,
	},
	perTCMetrics: Object.fromEntries(
		sortedTCs.map((tc) => {
			const pairs = tcGroups.get(tc)!;
			return [
				tc,
				{
					baseline: computeMetrics(pairs.map((p) => ({ predicted: p.baseline, actual: p.actual }))),
					phase1: computeMetrics(pairs.map((p) => ({ predicted: p.phase1, actual: p.actual }))),
				},
			];
		}),
	),
};

const jsonOut = "bench/phase1-results.json";
writeFileSync(jsonOut, `${JSON.stringify(outData, null, "\t")}\n`, "utf-8");
console.log();
console.log(`Results written to ${jsonOut}`);

process.exit(0);
