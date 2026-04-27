/**
 * Benchmark the analysis pipeline and/or rating prediction accuracy.
 *
 * Modes (controlled by flags):
 *   default          Stream PGN, run Stockfish, report timing per game
 *   --rating         Also compute R² of predicted Elo vs actual Elo
 *   --pre-evals      Use embedded %eval annotations instead of Stockfish (fast, rating only)
 *   --db             Pull completed analyses from the DB (no PGN needed, rating only)
 *
 * Usage:
 *   bun run benchmark <file.pgn> [--games N] [--rating]
 *   bun run benchmark <file.pgn.zst> --pre-evals [--games 200]
 *   bun run benchmark https://database.lichess.org/...pgn.zst --pre-evals
 *   bun run benchmark --db [--games 200]
 *   ANALYSIS_ENGINE_DEPTH=8 bun run benchmark <url>
 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { ANALYSIS_CONFIG } from "#/config/analysis";
import ratingFormula from "#/config/rating-formula.json";
import { analysisJobs, games } from "#/db/schema";
import { walkPgn } from "#/lib/analysis/pgn";
import { classifyMove, type PrevMoveContext } from "#/lib/move-classification";
import { computeGameAccuracy } from "#/lib/scoring/game-accuracy";
import { createStockfishWasmEngine } from "#/providers/stockfish-wasm-engine";

// ── Flags ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const FLAG_DB = argv.includes("--db");
const FLAG_PRE_EVALS = argv.includes("--pre-evals");
const FLAG_RATING = argv.includes("--rating") || FLAG_DB || FLAG_PRE_EVALS;
const FLAG_TIMING = !FLAG_DB && !FLAG_PRE_EVALS;

const DEFAULT_GAMES = FLAG_TIMING ? 5 : 200;
const gamesIdx = argv.indexOf("--games");
const TARGET_GAMES = gamesIdx !== -1 ? Number(argv[gamesIdx + 1]) : DEFAULT_GAMES;

const ENGINE_DEPTH =
	Number(process.env.ANALYSIS_ENGINE_DEPTH) || ANALYSIS_CONFIG.engineDepth;

const inputArg = argv.find((a) => !a.startsWith("--") && !/^\d+$/.test(a));

// ── Input streaming ───────────────────────────────────────────────────────────

type InputStream = {
	input: NodeJS.ReadableStream;
	label: string;
	proc?: ReturnType<typeof Bun.spawn>;
};

function openInputStream(arg: string | undefined): InputStream {
	if (!arg) return { input: process.stdin, label: "stdin" };

	if (arg.startsWith("http://") || arg.startsWith("https://")) {
		const proc = Bun.spawn(["sh", "-c", `curl -sL "${arg}" | zstd -d`], {
			stdout: "pipe",
			stderr: "ignore",
		});
		return {
			input: Readable.fromWeb(proc.stdout as ReadableStream<Uint8Array>),
			label: arg,
			proc,
		};
	}

	if (arg.endsWith(".zst")) {
		const proc = Bun.spawn(["zstd", "-d", "-c", arg], {
			stdout: "pipe",
			stderr: "ignore",
		});
		return {
			input: Readable.fromWeb(proc.stdout as ReadableStream<Uint8Array>),
			label: arg,
			proc,
		};
	}

	return { input: createReadStream(arg), label: arg };
}

async function* streamGames(
	input: NodeJS.ReadableStream,
): AsyncGenerator<string> {
	const rl = createInterface({ input, crlfDelay: Infinity });
	let buffer: string[] = [];
	for await (const line of rl) {
		if (line.startsWith("[Event ") && buffer.length > 0) {
			yield buffer.join("\n");
			buffer = [];
		}
		buffer.push(line);
	}
	if (buffer.length > 0) yield buffer.join("\n");
}

// ── PGN header / pre-eval parsing (mirrors calibrate-rating-formula.ts) ──────

type GameHeaders = {
	whiteElo: number;
	blackElo: number;
	timeControl: string;
};

function parseHeaders(lines: string[]): GameHeaders | null {
	let whiteElo = 0;
	let blackElo = 0;
	let timeControl = "";
	for (const line of lines) {
		if (!line.startsWith("[")) break;
		const m = line.match(/^\[(\w+)\s+"(.*)"\]$/);
		if (!m) continue;
		if (m[1] === "WhiteElo") whiteElo = Number(m[2]);
		else if (m[1] === "BlackElo") blackElo = Number(m[2]);
		else if (m[1] === "TimeControl") timeControl = m[2];
	}
	if (!whiteElo || !blackElo || !timeControl || timeControl === "-") return null;
	return { whiteElo, blackElo, timeControl };
}

function extractPreEvals(lines: string[]): number[] {
	const moveText = lines.filter((l) => !l.startsWith("[")).join(" ");
	const evals: number[] = [];
	const re = /\[%eval\s+(#-?\d+|-?\d+\.?\d*)\]/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(moveText)) !== null) {
		const raw = match[1];
		evals.push(
			raw.startsWith("#")
				? Number(raw.slice(1)) >= 0
					? 100000
					: -100000
				: Math.round(Number(raw) * 100),
		);
	}
	return evals;
}

// ── Rating formula ────────────────────────────────────────────────────────────

type Formula = { slope: number; offset: number };
const formula = ratingFormula as Record<string, Formula & { r2: number; sampleSize: number }>;

function predictElo(accuracy: number, timeControl: string): number | null {
	const f = formula[timeControl];
	if (!f) return null;
	return f.slope * accuracy + f.offset;
}

// ── R² computation ────────────────────────────────────────────────────────────

type RatingPoint = { predicted: number; actual: number; timeControl: string };

function computeR2(points: RatingPoint[]): number | null {
	if (points.length < 2) return null;
	const mean = points.reduce((s, p) => s + p.actual, 0) / points.length;
	const ssTot = points.reduce((s, p) => s + (p.actual - mean) ** 2, 0);
	const ssRes = points.reduce((s, p) => s + (p.actual - p.predicted) ** 2, 0);
	if (ssTot === 0) return null;
	return 1 - ssRes / ssTot;
}

function computeMae(points: RatingPoint[]): number | null {
	if (points.length === 0) return null;
	return points.reduce((s, p) => s + Math.abs(p.actual - p.predicted), 0) / points.length;
}

const RATING_BANDS: Array<{ label: string; min: number; max: number }> = [
	{ label: "≤1200", min: 0, max: 1200 },
	{ label: "1200-1600", min: 1200, max: 1600 },
	{ label: "1600-2000", min: 1600, max: 2000 },
	{ label: "2000+", min: 2000, max: Infinity },
];

function bandFor(rating: number): string {
	const b = RATING_BANDS.find((b) => rating >= b.min && rating < b.max);
	return b ? b.label : "?";
}

function printRatingMetrics(points: RatingPoint[]): void {
	console.log(`Rating prediction  (n=${points.length} data points):`);

	const byTC = new Map<string, RatingPoint[]>();
	for (const p of points) {
		if (!byTC.has(p.timeControl)) byTC.set(p.timeControl, []);
		byTC.get(p.timeControl)!.push(p);
	}

	const MIN_FOR_TC = 5;
	console.log("  By time control:");
	for (const [tc, tcPoints] of [...byTC.entries()].sort()) {
		if (tcPoints.length < MIN_FOR_TC) continue;
		const r2 = computeR2(tcPoints);
		const mae = computeMae(tcPoints);
		const calibR2 = formula[tc]?.r2;
		const calibStr = calibR2 !== undefined ? `  (calibration R²=${calibR2.toFixed(4)})` : "";
		console.log(
			`    ${tc.padEnd(10)}  n=${String(tcPoints.length).padStart(5)}  R²=${r2 !== null ? r2.toFixed(4) : "n/a"}  MAE=${mae !== null ? mae.toFixed(0) : "n/a"}${calibStr}`,
		);
	}

	const byBand = new Map<string, RatingPoint[]>();
	for (const p of points) {
		const b = bandFor(p.actual);
		if (!byBand.has(b)) byBand.set(b, []);
		byBand.get(b)!.push(p);
	}

	console.log("  By rating band:");
	for (const { label } of RATING_BANDS) {
		const bandPoints = byBand.get(label);
		if (!bandPoints || bandPoints.length < MIN_FOR_TC) continue;
		const r2 = computeR2(bandPoints);
		const mae = computeMae(bandPoints);
		console.log(
			`    ${label.padEnd(10)}  n=${String(bandPoints.length).padStart(5)}  R²=${r2 !== null ? r2.toFixed(4) : "n/a"}  MAE=${mae !== null ? mae.toFixed(0) : "n/a"}`,
		);
	}

	const overall = computeR2(points);
	const overallMae = computeMae(points);
	console.log(`  ${"overall".padEnd(10)}  n=${String(points.length).padStart(5)}  R²=${overall !== null ? overall.toFixed(4) : "n/a"}  MAE=${overallMae !== null ? overallMae.toFixed(0) : "n/a"}`);
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmt(ms: number): string {
	if (ms < 1000) return `${ms.toFixed(0)}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

function pad(s: string | number, n: number, right = false): string {
	const str = String(s);
	return right ? str.padEnd(n) : str.padStart(n);
}

// ── Stockfish analysis ────────────────────────────────────────────────────────

type PositionEval = { evalCp: number; bestMoveUci: string; bestMoveSan: string };

type GameAnalysisResult = {
	moves: number;
	positions: number;
	analysisMs: number;
	accuracyWhite: number;
	accuracyBlack: number;
	classificationCounts: Record<string, number>;
};

async function analyzeGameWithEngine(pgn: string): Promise<GameAnalysisResult | null> {
	let pgnMoves;
	try {
		pgnMoves = walkPgn(pgn);
	} catch {
		return null;
	}
	if (pgnMoves.length === 0) return null;

	const engine = createStockfishWasmEngine();
	await engine.init();

	const analysisStart = performance.now();
	const evals = new Map<string, PositionEval>();

	for (const move of pgnMoves) {
		if (!evals.has(move.fenBefore)) {
			const r = await engine.analyzePosition(move.fenBefore, ENGINE_DEPTH);
			evals.set(move.fenBefore, {
				evalCp: r.eval_cp,
				bestMoveUci: r.best_move_uci,
				bestMoveSan: r.best_move_san,
			});
		}
	}

	const lastMove = pgnMoves[pgnMoves.length - 1];
	if (!evals.has(lastMove.fenAfter)) {
		const r = await engine.analyzePosition(lastMove.fenAfter, ENGINE_DEPTH);
		evals.set(lastMove.fenAfter, {
			evalCp: r.eval_cp,
			bestMoveUci: r.best_move_uci,
			bestMoveSan: r.best_move_san,
		});
	}

	const analysisMs = performance.now() - analysisStart;
	await engine.destroy();

	const classificationCounts: Record<string, number> = {};
	const allEvalData = [];
	let prevWinPctLost: number | null = null;

	for (const move of pgnMoves) {
		const before = evals.get(move.fenBefore);
		const after = evals.get(move.fenAfter);
		if (!before || !after) continue;

		const prevContext: PrevMoveContext | undefined =
			prevWinPctLost !== null ? { opponentWinPctLost: prevWinPctLost } : undefined;

		const classification = classifyMove(
			move.uci,
			before.bestMoveUci,
			before.evalCp,
			after.evalCp,
			move.fenBefore,
			move.fenAfter,
			move.isWhite,
			prevContext,
		);

		const sigmoid = (cp: number) => 100 / (1 + Math.exp(-0.00368208 * cp));
		const winPctBefore = move.isWhite ? sigmoid(before.evalCp) : 100 - sigmoid(before.evalCp);
		const winPctAfter = move.isWhite ? sigmoid(after.evalCp) : 100 - sigmoid(after.evalCp);
		prevWinPctLost = Math.max(0, winPctBefore - winPctAfter);

		classificationCounts[classification] = (classificationCounts[classification] ?? 0) + 1;
		allEvalData.push({ evalBefore: before.evalCp, evalAfter: after.evalCp, isWhite: move.isWhite });
	}

	const gameAccuracy = computeGameAccuracy(allEvalData);
	return {
		moves: pgnMoves.length,
		positions: evals.size,
		analysisMs,
		accuracyWhite: gameAccuracy?.white ?? 0,
		accuracyBlack: gameAccuracy?.black ?? 0,
		classificationCounts,
	};
}

// ── DB mode ───────────────────────────────────────────────────────────────────

async function runDbMode(): Promise<void> {
	config({ path: ".env.local" });
	const DATABASE_URL = process.env.DATABASE_URL;
	if (!DATABASE_URL) {
		console.error("DATABASE_URL is not set in .env.local");
		process.exit(1);
	}

	const pool = new pg.Pool({ connectionString: DATABASE_URL });
	const db = drizzle(pool);

	console.log(`Querying DB for up to ${TARGET_GAMES} completed analyses...`);

	const rows = await db
		.select({
			playerRating: games.playerRating,
			timeControl: games.timeControl,
			playerColor: games.playerColor,
			accuracyWhite: analysisJobs.accuracyWhite,
			accuracyBlack: analysisJobs.accuracyBlack,
		})
		.from(games)
		.innerJoin(analysisJobs, eq(analysisJobs.gameId, games.id))
		.where(eq(analysisJobs.status, "complete"))
		.limit(TARGET_GAMES);

	await pool.end();

	const points: RatingPoint[] = [];
	for (const row of rows) {
		if (row.accuracyWhite == null || row.accuracyBlack == null) continue;
		const accuracy = row.playerColor === "white" ? row.accuracyWhite : row.accuracyBlack;
		const predicted = predictElo(accuracy, row.timeControl);
		if (predicted === null) continue;
		points.push({ predicted, actual: row.playerRating, timeControl: row.timeControl });
	}

	console.log();
	if (points.length === 0) {
		console.log("No games matched a known time control in rating-formula.json.");
		process.exit(1);
	}

	printRatingMetrics(points);
}

// ── Pre-evals mode ────────────────────────────────────────────────────────────

async function runPreEvalsMode(): Promise<void> {
	if (!inputArg) {
		console.error("A PGN source is required for --pre-evals mode.");
		process.exit(1);
	}

	const { input, proc } = openInputStream(inputArg);
	const points: RatingPoint[] = [];
	let scanned = 0;

	process.stdout.write("Scanning games...\r");

	for await (const pgn of streamGames(input)) {
		const lines = pgn.split("\n");
		const headers = parseHeaders(lines);
		if (!headers) continue;

		const evals = extractPreEvals(lines);
		if (evals.length < 10) continue;

		const moveEvals = evals.map((evalAfter, i) => ({
			evalBefore: i === 0 ? 0 : evals[i - 1],
			evalAfter,
			isWhite: i % 2 === 0,
		}));
		const accuracy = computeGameAccuracy(moveEvals);
		if (!accuracy) continue;

		for (const [color, elo] of [
			["white", headers.whiteElo],
			["black", headers.blackElo],
		] as const) {
			const acc = color === "white" ? accuracy.white : accuracy.black;
			const predicted = predictElo(acc, headers.timeControl);
			if (predicted !== null)
				points.push({ predicted, actual: elo, timeControl: headers.timeControl });
		}

		scanned++;
		if (scanned % 100 === 0) process.stdout.write(`Scanned ${scanned} games...\r`);
		if (points.length >= TARGET_GAMES * 2) break;
	}

	proc?.kill();
	process.stdout.write("\n");

	if (points.length === 0) {
		console.log("No matching games found (need %eval annotations + known time control).");
		process.exit(1);
	}

	printRatingMetrics(points);
}

// ── Stockfish timing mode ─────────────────────────────────────────────────────

async function runTimingMode(): Promise<void> {
	if (!inputArg) {
		console.error("A PGN source is required.");
		process.exit(1);
	}

	const initStart = performance.now();
	const warmup = createStockfishWasmEngine();
	await warmup.init();
	const initMs = performance.now() - initStart;
	await warmup.destroy();

	console.log(`Engine init: ${fmt(initMs)}`);
	console.log();

	const colHeader = FLAG_RATING
		? `${pad("Game", 5)}  ${pad("Moves", 5)}  ${pad("Positions", 9)}  ${pad("Analysis", 10)}  ${pad("ms/pos", 7)}  Accuracy (W / B)  Predicted (W / B)  Actual (W / B)  TC`
		: `${pad("Game", 5)}  ${pad("Moves", 5)}  ${pad("Positions", 9)}  ${pad("Analysis", 10)}  ${pad("ms/pos", 7)}  Accuracy (W / B)`;
	console.log(colHeader);
	console.log("─".repeat(FLAG_RATING ? 110 : 70));

	const { input, proc } = openInputStream(inputArg);
	const results: GameAnalysisResult[] = [];
	const ratingPoints: RatingPoint[] = [];
	let gameNum = 0;

	for await (const pgn of streamGames(input)) {
		const result = await analyzeGameWithEngine(pgn);
		if (!result) continue;

		gameNum++;
		const msPerPos = result.positions > 0 ? result.analysisMs / result.positions : 0;

		let ratingCol = "";
		if (FLAG_RATING) {
			const lines = pgn.split("\n");
			const headers = parseHeaders(lines);
			if (headers) {
				const predW = predictElo(result.accuracyWhite, headers.timeControl);
				const predB = predictElo(result.accuracyBlack, headers.timeControl);
				for (const [color, elo, pred] of [
					["white", headers.whiteElo, predW],
					["black", headers.blackElo, predB],
				] as const) {
					if (pred !== null)
						ratingPoints.push({ predicted: pred, actual: elo, timeControl: headers.timeControl });
				}
				const predStr = `${predW !== null ? Math.round(predW) : "—"} / ${predB !== null ? Math.round(predB) : "—"}`;
				const actualStr = `${headers.whiteElo} / ${headers.blackElo}`;
				ratingCol = `  ${pad(predStr, 17)}  ${pad(actualStr, 14)}  ${headers.timeControl}`;
			}
		}

		console.log(
			`${pad(gameNum, 5)}  ${pad(result.moves, 5)}  ${pad(result.positions, 9)}  ${pad(fmt(result.analysisMs), 10)}  ${pad(fmt(msPerPos), 7)}  ${result.accuracyWhite.toFixed(1)} / ${result.accuracyBlack.toFixed(1)}${ratingCol}`,
		);

		results.push(result);
		if (gameNum >= TARGET_GAMES) break;
	}

	proc?.kill();

	if (results.length === 0) {
		console.log("No valid games found.");
		process.exit(1);
	}

	const totalMs = results.reduce((s, r) => s + r.analysisMs, 0);
	const totalPositions = results.reduce((s, r) => s + r.positions, 0);
	const allCounts: Record<string, number> = {};
	for (const r of results)
		for (const [k, v] of Object.entries(r.classificationCounts))
			allCounts[k] = (allCounts[k] ?? 0) + v;

	console.log("─".repeat(FLAG_RATING ? 85 : 70));
	console.log();
	console.log(`Summary (${results.length} game${results.length !== 1 ? "s" : ""}):`);
	console.log(`  Total analysis time:   ${fmt(totalMs)}`);
	console.log(`  Avg time / game:       ${fmt(totalMs / results.length)}`);
	console.log(`  Avg time / position:   ${fmt(totalPositions > 0 ? totalMs / totalPositions : 0)}`);
	console.log(`  Avg moves / game:      ${(results.reduce((s, r) => s + r.moves, 0) / results.length).toFixed(1)}`);
	console.log();

	const classOrder = ["brilliant", "best", "excellent", "good", "inaccuracy", "mistake", "blunder", "great", "miss"];
	const countStr = classOrder
		.filter((k) => allCounts[k])
		.map((k) => `${k}=${allCounts[k]}`)
		.join("  ");
	console.log(`Move breakdown:  ${countStr}`);

	if (FLAG_RATING && ratingPoints.length > 0) {
		console.log();
		printRatingMetrics(ratingPoints);
	}
}

// ── Entry point ───────────────────────────────────────────────────────────────

console.log("Chess Analyzer — Analysis Benchmark");
if (FLAG_TIMING) console.log(`Config: depth=${ENGINE_DEPTH}, multiPv=${ANALYSIS_CONFIG.multiPv}`);

const modeLabel = FLAG_DB ? "db" : FLAG_PRE_EVALS ? "pre-evals" : `stockfish depth=${ENGINE_DEPTH}`;
console.log(`Mode: ${modeLabel}  |  Sampling ${TARGET_GAMES} game${TARGET_GAMES !== 1 ? "s" : ""}`);
console.log();

if (FLAG_DB) {
	await runDbMode();
} else if (FLAG_PRE_EVALS) {
	await runPreEvalsMode();
} else {
	await runTimingMode();
}

process.exit(0);
