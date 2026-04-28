/**
 * Build a reusable evaluation cache for offline experiment scripts.
 *
 * For each game in a Lichess PGN (local file, .zst, or URL), runs Stockfish
 * multipv=2 on each unique position and writes one JSONL row per game to disk.
 * Downstream scripts (eval-phase1.ts, etc.) can iterate the cache without
 * touching Stockfish again.
 *
 * Usage:
 *   bun scripts/build-eval-cache.ts <url-or-path> [--games 300] [--depth 12]
 *   bun scripts/build-eval-cache.ts <url> --stratify --games 300
 *   bun scripts/build-eval-cache.ts <url> --out bench/cache/my-sample.jsonl
 *   bun scripts/build-eval-cache.ts <url> --workers 4
 *
 * Download PGN databases from https://database.lichess.org/
 */

import {
	appendFileSync,
	createReadStream,
	existsSync,
	mkdirSync,
	readFileSync,
} from "node:fs";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { basename } from "node:path";
import { createHash } from "node:crypto";
import { ANALYSIS_CONFIG } from "#/config/analysis";
import { computeMoveAccuracy } from "#/lib/analysis/accuracy";
import { walkPgn } from "#/lib/analysis/pgn";
import { moveComplexity } from "#/lib/scoring/complexity";
import { createStockfishWasmEngine } from "#/providers/stockfish-wasm-engine";

// ── CLI args ──────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function argValue(flag: string): string | undefined {
	const idx = argv.indexOf(flag);
	return idx !== -1 ? argv[idx + 1] : undefined;
}

const inputArg = argv.find((a) => !a.startsWith("--") && !/^\d+$/.test(a));
const TARGET_GAMES = Number(argValue("--games") ?? "300");
const ENGINE_DEPTH =
	Number(argValue("--depth") ?? process.env.ANALYSIS_ENGINE_DEPTH ?? "0") ||
	ANALYSIS_CONFIG.engineDepth;
const FLAG_STRATIFY = argv.includes("--stratify");
const WORKERS = Number(argValue("--workers") ?? "4");

const defaultOut = inputArg
	? `bench/cache/${basename(inputArg).replace(/\.zst$/, "").replace(/\.pgn$/, "")}.jsonl`
	: "bench/cache/output.jsonl";
const OUT_PATH = argValue("--out") ?? defaultOut;

// ── Time control classification ────────────────────────────────────────────────

function classifyTimeControl(tc: string): string {
	const m = tc.match(/^(\d+)\+(\d+)$/);
	if (!m) return "correspondence";
	const base = Number(m[1]);
	const inc = Number(m[2]);
	// Estimated total time per player in seconds: base + 40 increments
	const total = base + 40 * inc;
	if (total < 180) return "bullet";
	if (total < 480) return "blitz";
	if (total < 1500) return "rapid";
	return "classical";
}

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
			stderr: "inherit",
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
			stderr: "inherit",
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

// ── PGN header parsing ────────────────────────────────────────────────────────

type GameHeaders = {
	whiteElo: number;
	blackElo: number;
	timeControl: string;
	result: string;
	site: string;
};

function parseHeaders(lines: string[]): GameHeaders | null {
	let whiteElo = 0;
	let blackElo = 0;
	let timeControl = "";
	let result = "";
	let site = "";
	for (const line of lines) {
		if (!line.startsWith("[")) break;
		const m = line.match(/^\[(\w+)\s+"(.*)"\]$/);
		if (!m) continue;
		const [, key, val] = m;
		if (key === "WhiteElo") whiteElo = Number(val);
		else if (key === "BlackElo") blackElo = Number(val);
		else if (key === "TimeControl") timeControl = val;
		else if (key === "Result") result = val;
		else if (key === "Site") site = val;
	}
	if (!whiteElo || !blackElo || !timeControl || timeControl === "-" || !result)
		return null;
	return { whiteElo, blackElo, timeControl, result, site };
}

/** Parse [%clk h:mm:ss] annotations from the move text. */
function parseClockMs(moveText: string): (number | null)[] {
	const clocks: (number | null)[] = [];
	const re = /\[%clk\s+(\d+):(\d+):(\d+)\]/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(moveText)) !== null) {
		const h = Number(match[1]);
		const min = Number(match[2]);
		const sec = Number(match[3]);
		clocks.push((h * 3600 + min * 60 + sec) * 1000);
	}
	return clocks;
}

// ── Game ID (stable hash) ─────────────────────────────────────────────────────

function gameId(pgn: string): string {
	const lines = pgn.split("\n");
	const headers = lines.filter((l) => l.startsWith("[")).join("\n");
	// Take first 40 moves (80 half-moves) from move text
	const moveText = lines
		.filter((l) => !l.startsWith("[") && l.trim())
		.join(" ")
		.slice(0, 400);
	return createHash("sha1")
		.update(`${headers}|${moveText}`)
		.digest("hex")
		.slice(0, 16);
}

// ── Stratified sampling ───────────────────────────────────────────────────────

type RatingBand = "≤1200" | "1200-1600" | "1600-2000" | "2000+";

function ratingBand(elo: number): RatingBand {
	if (elo <= 1200) return "≤1200";
	if (elo <= 1600) return "1200-1600";
	if (elo <= 2000) return "1600-2000";
	return "2000+";
}

function stratCell(elo: number, tcClass: string): string {
	return `${tcClass}:${ratingBand(elo)}`;
}

// ── Cache output types ────────────────────────────────────────────────────────

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

// ── Resume: read existing cache ────────────────────────────────────────────────

function loadExistingCache(path: string): {
	seen: Set<string>;
	cellCounts: Map<string, number>;
} {
	const seen = new Set<string>();
	const cellCounts = new Map<string, number>();

	if (!existsSync(path)) return { seen, cellCounts };

	const lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);
	for (const line of lines) {
		try {
			const row = JSON.parse(line) as CachedGame;
			seen.add(row.gameId);
			// Count each color separately for stratification
			for (const elo of [row.whiteElo, row.blackElo]) {
				const cell = stratCell(elo, row.timeControlClass);
				cellCounts.set(cell, (cellCounts.get(cell) ?? 0) + 1);
			}
		} catch {}
	}
	return { seen, cellCounts };
}

// ── Engine pool ───────────────────────────────────────────────────────────────

type Engine = ReturnType<typeof createStockfishWasmEngine>;

class EnginePool {
	private idle: Engine[] = [];
	private waiters: Array<(engine: Engine) => void> = [];
	private all: Engine[] = [];

	constructor(engines: Engine[]) {
		this.all = engines;
		this.idle = [...engines];
	}

	acquire(): Promise<Engine> {
		if (this.idle.length > 0) {
			return Promise.resolve(this.idle.pop()!);
		}
		return new Promise((resolve) => {
			this.waiters.push(resolve);
		});
	}

	release(engine: Engine): void {
		if (this.waiters.length > 0) {
			const waiter = this.waiters.shift()!;
			waiter(engine);
		} else {
			this.idle.push(engine);
		}
	}

	async close(): Promise<void> {
		await Promise.all(this.all.map((e) => e.destroy()));
	}
}

async function initEnginePool(size: number): Promise<EnginePool> {
	console.log(`Initializing ${size} Stockfish engine(s) in parallel…`);
	const engines = await Promise.all(
		Array.from({ length: size }, async () => {
			const engine = createStockfishWasmEngine();
			await engine.init();
			return engine;
		}),
	);
	console.log(`Engine pool ready (${size} workers).`);
	return new EnginePool(engines);
}

// ── Engine analysis with in-process FEN cache ─────────────────────────────────

type FenCache = Map<
	string,
	{ evalCp: number; pv2Cp: number | null; bestUci: string; bestSan: string }
>;

async function buildGameCache(
	pgn: string,
	engine: Engine,
	fenCache: FenCache,
): Promise<CachedGame | null> {
	const lines = pgn.split("\n");
	const headers = parseHeaders(lines);
	if (!headers) return null;

	let pgnMoves;
	try {
		pgnMoves = walkPgn(pgn);
	} catch {
		return null;
	}
	if (pgnMoves.length < 10) return null;

	const tcClass = classifyTimeControl(headers.timeControl);
	const moveText = lines.filter((l) => !l.startsWith("[")).join(" ");
	const clockAnnotations = parseClockMs(moveText);

	// Collect all FENs that need analysis (before + final after)
	const fensToAnalyze: string[] = [];
	for (const m of pgnMoves) {
		if (!fenCache.has(m.fenBefore)) fensToAnalyze.push(m.fenBefore);
	}
	const lastFen = pgnMoves[pgnMoves.length - 1].fenAfter;
	if (!fenCache.has(lastFen)) fensToAnalyze.push(lastFen);

	// Deduplicate while preserving order
	const unique = [...new Set(fensToAnalyze)];

	for (const fen of unique) {
		if (fenCache.has(fen)) continue;
		const result = await engine.analyzePosition(fen, ENGINE_DEPTH);
		const isBlackToMove = fen.split(" ")[1] === "b";
		const pv2WhitePersp = result.pvs[1]?.eval_cp ?? null;
		const pv2SideToMove =
			pv2WhitePersp !== null
				? isBlackToMove
					? -pv2WhitePersp
					: pv2WhitePersp
				: null;
		fenCache.set(fen, {
			evalCp: result.eval_cp,
			pv2Cp: pv2SideToMove,
			bestUci: result.best_move_uci,
			bestSan: result.best_move_san,
		});
	}

	const gid = gameId(pgn);
	const cachedMoves: CachedMove[] = [];

	for (let i = 0; i < pgnMoves.length; i++) {
		const move = pgnMoves[i];
		const before = fenCache.get(move.fenBefore);
		const after = fenCache.get(move.fenAfter);
		if (!before || !after) continue;

		const pv1SideToMove = move.isWhite ? before.evalCp : -before.evalCp;
		const complexity = moveComplexity(pv1SideToMove, before.pv2Cp);

		const accuracy = computeMoveAccuracy({
			evalBefore: before.evalCp,
			evalAfter: after.evalCp,
			isWhite: move.isWhite,
		});

		cachedMoves.push({
			ply: move.ply,
			isWhite: move.isWhite,
			san: move.san,
			uci: move.uci,
			fenBefore: move.fenBefore,
			fenAfter: move.fenAfter,
			evalBeforeCp: before.evalCp,
			evalAfterCp: after.evalCp,
			pv2BeforeCp: before.pv2Cp,
			bestMoveUci: before.bestUci,
			bestMoveSan: before.bestSan,
			complexity,
			accuracy,
			clockMs: clockAnnotations[i] ?? null,
		});
	}

	return {
		gameId: gid,
		whiteElo: headers.whiteElo,
		blackElo: headers.blackElo,
		timeControl: headers.timeControl,
		timeControlClass: tcClass,
		result: headers.result,
		moves: cachedMoves,
	};
}

// ── Stratified sampling helpers ────────────────────────────────────────────────

function shouldInclude(
	game: CachedGame,
	cellCounts: Map<string, number>,
	targetPerCell: number,
): boolean {
	if (!FLAG_STRATIFY) return true;
	// Accept if either player's cell still has room
	for (const elo of [game.whiteElo, game.blackElo]) {
		const cell = stratCell(elo, game.timeControlClass);
		if ((cellCounts.get(cell) ?? 0) < targetPerCell) return true;
	}
	return false;
}

/**
 * Header-only stratification check, runs before Stockfish work.
 * Avoids burning engine time on games we'd reject anyway.
 */
function shouldIncludeFromHeaders(
	headers: GameHeaders,
	cellCounts: Map<string, number>,
	targetPerCell: number,
): boolean {
	if (!FLAG_STRATIFY) return true;
	const tcClass = classifyTimeControl(headers.timeControl);
	for (const elo of [headers.whiteElo, headers.blackElo]) {
		const cell = stratCell(elo, tcClass);
		if ((cellCounts.get(cell) ?? 0) < targetPerCell) return true;
	}
	return false;
}

function recordCellCounts(
	game: CachedGame,
	cellCounts: Map<string, number>,
): void {
	for (const elo of [game.whiteElo, game.blackElo]) {
		const cell = stratCell(elo, game.timeControlClass);
		cellCounts.set(cell, (cellCounts.get(cell) ?? 0) + 1);
	}
}

// ── Per-game task (runs concurrently across pool) ─────────────────────────────

async function processGame(
	pgn: string,
	pool: EnginePool,
	fenCache: FenCache,
	seen: Set<string>,
	cellCounts: Map<string, number>,
	state: { gamesWritten: number; gamesScanned: number; gamesRejectedByHeaders: number },
): Promise<void> {
	const engine = await pool.acquire();
	try {
		const cached = await buildGameCache(pgn, engine, fenCache);
		if (!cached) return;

		// shouldInclude + record + append must be a single synchronous block —
		// no await between the read of cellCounts and the write, so two tasks
		// that interleave on an await boundary cannot both see "cell has room"
		// and then both record. At most WORKERS-1 overshoot is acceptable.
		if (!shouldInclude(cached, cellCounts, TARGET_PER_CELL)) return;
		appendFileSync(OUT_PATH, `${JSON.stringify(cached)}\n`);
		seen.add(cached.gameId);
		recordCellCounts(cached, cellCounts);
		state.gamesWritten++;

		if (state.gamesWritten % 10 === 0 || state.gamesWritten === TARGET_GAMES) {
			console.log(
				`Progress: ${state.gamesWritten}/${TARGET_GAMES} games written` +
					` (scanned ${state.gamesScanned},` +
					` ${state.gamesRejectedByHeaders} rejected pre-engine,` +
					` workers=${WORKERS})`,
			);
		}
	} finally {
		pool.release(engine);
	}
}

// ── Main ──────────────────────────────────────────────────────────────────────

if (!inputArg) {
	console.error("Usage: bun scripts/build-eval-cache.ts <url-or-path> [--games N] [--workers N]");
	process.exit(1);
}

mkdirSync("bench/cache", { recursive: true });

const { seen, cellCounts } = loadExistingCache(OUT_PATH);
const existingCount = seen.size;
if (existingCount > 0) {
	console.log(
		`Resuming — found ${existingCount} existing game(s) in ${OUT_PATH}`,
	);
}

// Note: appending synchronously after each game so a kill mid-stream doesn't
// drop buffered work. Stockfish per-game cost dwarfs the syscall overhead.

console.log(
	`Build eval cache — target=${TARGET_GAMES} games, depth=${ENGINE_DEPTH}, stratify=${FLAG_STRATIFY}, workers=${WORKERS}`,
);
console.log(`Output: ${OUT_PATH}`);
console.log();

// Target per stratification cell: rough even split across 4 bands × 4 TC classes
const TARGET_PER_CELL = Math.ceil(TARGET_GAMES / 16);

// Shared FEN cache across all games to avoid re-analyzing the same position.
// Two tasks may race to populate the same FEN entry, but Map.set is atomic in
// JS and engine.analyzePosition is idempotent — worst case is duplicate work,
// not corruption.
const fenCache: FenCache = new Map();

const pool = await initEnginePool(WORKERS);
const { input, proc } = openInputStream(inputArg);

const state = {
	gamesWritten: seen.size,
	gamesScanned: 0,
	gamesRejectedByHeaders: 0,
};

const inflight = new Set<Promise<void>>();

for await (const pgn of streamGames(input)) {
	state.gamesScanned++;
	if (state.gamesWritten >= TARGET_GAMES) break;

	const gid = gameId(pgn);
	if (seen.has(gid)) continue;

	// Cheap pre-check: reject from header data BEFORE running Stockfish.
	// Saves ~10x engine time once popular cells fill up.
	const headers = parseHeaders(pgn.split("\n"));
	if (!headers) continue;
	if (!shouldIncludeFromHeaders(headers, cellCounts, TARGET_PER_CELL)) {
		state.gamesRejectedByHeaders++;
		continue;
	}

	// Wait until a worker slot is free before dispatching another game.
	while (inflight.size >= WORKERS) await Promise.race(inflight);

	// Re-check target after awaiting — another task may have finished and
	// pushed us over the limit while we were waiting for a slot.
	if (state.gamesWritten >= TARGET_GAMES) break;

	const task: Promise<void> = processGame(
		pgn,
		pool,
		fenCache,
		seen,
		cellCounts,
		state,
	).finally(() => inflight.delete(task));
	inflight.add(task);
}

await Promise.all(inflight);

proc?.kill();
await pool.close();

console.log();
console.log(`Done. ${state.gamesWritten} total game(s) in ${OUT_PATH}.`);

if (FLAG_STRATIFY) {
	console.log("\nCell counts:");
	for (const [cell, count] of [...cellCounts.entries()].sort()) {
		console.log(`  ${cell.padEnd(30)}  ${count}`);
	}
}

process.exit(0);
