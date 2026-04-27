/**
 * Benchmark the analysis pipeline on real games from a PGN source.
 *
 * Streams a PGN file/URL (same formats as calibrate-rating-formula.ts),
 * samples N games, runs actual Stockfish analysis on each, and reports
 * per-game timing and an aggregate summary.
 *
 * Use this to tune ANALYSIS_CONFIG.engineDepth — change the depth and
 * re-run to see how ms/position changes.
 *
 * Usage:
 *   bun scripts/benchmark-analysis.ts <file.pgn>
 *   bun scripts/benchmark-analysis.ts <file.pgn.zst>
 *   bun scripts/benchmark-analysis.ts https://database.lichess.org/...pgn.zst
 *   bun scripts/benchmark-analysis.ts <url> --games 10
 *   ANALYSIS_ENGINE_DEPTH=8 bun scripts/benchmark-analysis.ts <url>
 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { ANALYSIS_CONFIG } from "#/config/analysis";
import { computeEvalDelta, computeMoveAccuracy } from "#/lib/analysis/accuracy";
import { walkPgn } from "#/lib/analysis/pgn";
import { classifyMove, type PrevMoveContext } from "#/lib/move-classification";
import { computeGameAccuracy } from "#/lib/scoring/game-accuracy";
import { createStockfishWasmEngine } from "#/providers/stockfish-wasm-engine";

// ── Config ───────────────────────────────────────────────────────────────────

const ENGINE_DEPTH =
	Number(process.env.ANALYSIS_ENGINE_DEPTH) || ANALYSIS_CONFIG.engineDepth;

const TARGET_GAMES = parseGamesFlag(process.argv) ?? 5;

function parseGamesFlag(argv: string[]): number | null {
	const idx = argv.indexOf("--games");
	if (idx !== -1 && argv[idx + 1]) return Number(argv[idx + 1]);
	return null;
}

// ── Input streaming (mirrors calibrate-rating-formula.ts) ────────────────────

type InputStream = {
	input: NodeJS.ReadableStream;
	label: string;
	proc?: ReturnType<typeof Bun.spawn>;
};

function openInputStream(arg: string | undefined): InputStream {
	if (!arg) {
		return { input: process.stdin, label: "stdin" };
	}

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

// ── PGN buffering ─────────────────────────────────────────────────────────────

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

// ── Analysis (mirrors evaluate + buildMoveRows in analyze-game.ts) ───────────

type PositionEval = {
	evalCp: number;
	bestMoveUci: string;
	bestMoveSan: string;
};

type GameResult = {
	moves: number;
	positions: number;
	analysisMs: number;
	accuracyWhite: number;
	accuracyBlack: number;
	classificationCounts: Record<string, number>;
};

async function analyzeGame(pgn: string): Promise<GameResult | null> {
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
			const result = await engine.analyzePosition(move.fenBefore, ENGINE_DEPTH);
			evals.set(move.fenBefore, {
				evalCp: result.eval_cp,
				bestMoveUci: result.best_move_uci,
				bestMoveSan: result.best_move_san,
			});
		}
	}

	// Evaluate final position too (same as worker job).
	const lastMove = pgnMoves[pgnMoves.length - 1];
	if (!evals.has(lastMove.fenAfter)) {
		const result = await engine.analyzePosition(lastMove.fenAfter, ENGINE_DEPTH);
		evals.set(lastMove.fenAfter, {
			evalCp: result.eval_cp,
			bestMoveUci: result.best_move_uci,
			bestMoveSan: result.best_move_san,
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
			prevWinPctLost !== null
				? { opponentWinPctLost: prevWinPctLost }
				: undefined;

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

		const winPctBefore = move.isWhite
			? 100 / (1 + Math.exp(-0.00368208 * before.evalCp))
			: 100 - 100 / (1 + Math.exp(-0.00368208 * before.evalCp));
		const winPctAfter = move.isWhite
			? 100 / (1 + Math.exp(-0.00368208 * after.evalCp))
			: 100 - 100 / (1 + Math.exp(-0.00368208 * after.evalCp));
		prevWinPctLost = Math.max(0, winPctBefore - winPctAfter);

		classificationCounts[classification] =
			(classificationCounts[classification] ?? 0) + 1;

		allEvalData.push({
			evalBefore: before.evalCp,
			evalAfter: after.evalCp,
			isWhite: move.isWhite,
		});
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

// ── Formatting ────────────────────────────────────────────────────────────────

function fmt(ms: number): string {
	if (ms < 1000) return `${ms.toFixed(0)}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

function pad(s: string | number, n: number, right = false): string {
	const str = String(s);
	return right ? str.padEnd(n) : str.padStart(n);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const inputArg = process.argv.slice(2).find((a) => !a.startsWith("--") && !/^\d+$/.test(a));

console.log("Chess Analyzer — Analysis Benchmark");
console.log(`Config: depth=${ENGINE_DEPTH}, multiPv=${ANALYSIS_CONFIG.multiPv}`);
console.log(`Source: ${inputArg ?? "stdin"}  |  Sampling ${TARGET_GAMES} games`);
console.log();

// Engine init timing
const initStart = performance.now();
// (We init once per game in analyzeGame to match the worker — init cost is included in per-game time)
// Do a quick init to report init time separately.
const warmupEngine = createStockfishWasmEngine();
await warmupEngine.init();
const initMs = performance.now() - initStart;
await warmupEngine.destroy();

console.log(`Engine init: ${fmt(initMs)}`);
console.log();

// Table header
console.log(
	`${pad("Game", 5)}  ${pad("Moves", 5)}  ${pad("Positions", 9)}  ${pad("Analysis", 10)}  ${pad("ms/pos", 7)}  Accuracy (W / B)`,
);
console.log("─".repeat(70));

const { input, label, proc } = openInputStream(inputArg);
const results: GameResult[] = [];
let gameNum = 0;
let scanned = 0;

for await (const pgn of streamGames(input)) {
	scanned++;
	const result = await analyzeGame(pgn);
	if (!result) continue;

	gameNum++;
	const msPerPos = result.positions > 0 ? result.analysisMs / result.positions : 0;

	console.log(
		`${pad(gameNum, 5)}  ${pad(result.moves, 5)}  ${pad(result.positions, 9)}  ${pad(fmt(result.analysisMs), 10)}  ${pad(fmt(msPerPos), 7)}  ${result.accuracyWhite.toFixed(1)} / ${result.accuracyBlack.toFixed(1)}`,
	);

	results.push(result);
	if (gameNum >= TARGET_GAMES) break;
}

proc?.kill();

if (results.length === 0) {
	console.log("No valid games found.");
	process.exit(1);
}

// Aggregate summary
const totalAnalysisMs = results.reduce((s, r) => s + r.analysisMs, 0);
const totalPositions = results.reduce((s, r) => s + r.positions, 0);
const avgMsPerGame = totalAnalysisMs / results.length;
const avgMsPerPos = totalPositions > 0 ? totalAnalysisMs / totalPositions : 0;
const avgMoves = results.reduce((s, r) => s + r.moves, 0) / results.length;

const allCounts: Record<string, number> = {};
for (const r of results) {
	for (const [k, v] of Object.entries(r.classificationCounts)) {
		allCounts[k] = (allCounts[k] ?? 0) + v;
	}
}

console.log("─".repeat(70));
console.log();
console.log(`Summary (${results.length} game${results.length !== 1 ? "s" : ""}):`);
console.log(`  Total analysis time:   ${fmt(totalAnalysisMs)}`);
console.log(`  Avg time / game:       ${fmt(avgMsPerGame)}`);
console.log(`  Avg time / position:   ${fmt(avgMsPerPos)}`);
console.log(`  Avg moves / game:      ${avgMoves.toFixed(1)}`);
console.log();

const classOrder = ["brilliant", "best", "excellent", "good", "inaccuracy", "mistake", "blunder", "great", "miss"];
const countStr = classOrder
	.filter((k) => allCounts[k])
	.map((k) => `${k}=${allCounts[k]}`)
	.join("  ");
console.log(`Move breakdown:  ${countStr}`);
