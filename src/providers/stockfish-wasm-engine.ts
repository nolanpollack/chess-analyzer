/**
 * Stockfish WASM engine implementation.
 *
 * Spawns the stockfish-18-single.js WASM module as a child process
 * and communicates via UCI protocol over stdin/stdout.
 *
 * This runs in the worker process only — never in the web server.
 */
import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import { Chess } from "chess.js";
import type { AnalysisEngine, PositionEval } from "#/providers/analysis-engine";

/** Convert a mate-in-N score to a large centipawn value for sorting/comparison */
function mateScoreToCp(mateIn: number): number {
	// Positive mateIn = white mates in N moves, negative = black mates
	return mateIn > 0 ? 100000 - mateIn : -100000 - mateIn;
}

/** Convert UCI move (e.g. "g1f3") to SAN (e.g. "Nf3") using chess.js */
function uciToSan(fen: string, uci: string): string {
	const chess = new Chess(fen);
	const from = uci.slice(0, 2);
	const to = uci.slice(2, 4);
	const promotion = uci.length > 4 ? uci[4] : undefined;

	const move = chess.move({ from, to, promotion });
	if (!move) {
		// Fallback: return UCI if conversion fails
		return uci;
	}
	return move.san;
}

type ParsedInfo = {
	depth: number;
	scoreCp: number | null;
	scoreMate: number | null;
	pv: string[];
};

/** Parse a UCI `info` line into structured data */
function parseInfoLine(line: string): ParsedInfo | null {
	// Only parse lines with depth and score
	const depthMatch = line.match(/\bdepth\s+(\d+)/);
	if (!depthMatch) return null;

	const depth = Number.parseInt(depthMatch[1], 10);

	let scoreCp: number | null = null;
	let scoreMate: number | null = null;

	const cpMatch = line.match(/\bscore\s+cp\s+(-?\d+)/);
	if (cpMatch) {
		scoreCp = Number.parseInt(cpMatch[1], 10);
	}

	const mateMatch = line.match(/\bscore\s+mate\s+(-?\d+)/);
	if (mateMatch) {
		scoreMate = Number.parseInt(mateMatch[1], 10);
	}

	if (scoreCp === null && scoreMate === null) return null;

	const pvMatch = line.match(/\bpv\s+(.+)/);
	const pv = pvMatch ? pvMatch[1].trim().split(/\s+/) : [];

	return { depth, scoreCp, scoreMate, pv };
}

export function createStockfishWasmEngine(): AnalysisEngine {
	let process: ChildProcess | null = null;
	let outputBuffer = "";
	let lineListeners: ((line: string) => void)[] = [];

	function onLine(callback: (line: string) => void): void {
		lineListeners.push(callback);
	}

	function removeLineListener(callback: (line: string) => void): void {
		lineListeners = lineListeners.filter((l) => l !== callback);
	}

	function sendCommand(cmd: string): void {
		if (!process?.stdin) {
			throw new Error("Stockfish process not initialized");
		}
		process.stdin.write(`${cmd}\n`);
	}

	/** Wait for a line matching a predicate */
	function waitForLine(
		predicate: (line: string) => boolean,
		timeoutMs = 30000,
	): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			const timeout = setTimeout(() => {
				removeLineListener(handler);
				reject(new Error("Stockfish response timeout"));
			}, timeoutMs);

			function handler(line: string) {
				if (predicate(line)) {
					clearTimeout(timeout);
					removeLineListener(handler);
					resolve(line);
				}
			}

			onLine(handler);
		});
	}

	return {
		async init(): Promise<void> {
			const enginePath = path.resolve(
				import.meta.dirname ?? __dirname,
				"../../node_modules/stockfish/bin/stockfish-18-single.js",
			);

			process = spawn("node", [enginePath], {
				stdio: ["pipe", "pipe", "pipe"],
			});

			// Buffer stdout and emit lines
			process.stdout?.on("data", (data: Buffer) => {
				outputBuffer += data.toString();
				const lines = outputBuffer.split("\n");
				// Keep the last incomplete line in the buffer
				outputBuffer = lines.pop() ?? "";
				for (const line of lines) {
					const trimmed = line.trim();
					if (trimmed) {
						for (const listener of lineListeners) {
							listener(trimmed);
						}
					}
				}
			});

			process.stderr?.on("data", (data: Buffer) => {
				const msg = data.toString().trim();
				if (msg) {
					console.error("[stockfish stderr]", msg);
				}
			});

			process.on("error", (err) => {
				console.error("[stockfish process error]", err);
			});

			// Send UCI initialization
			sendCommand("uci");
			await waitForLine((line) => line === "uciok");

			// Configure engine
			sendCommand("setoption name Threads value 1");
			sendCommand("setoption name Hash value 64");
			sendCommand("isready");
			await waitForLine((line) => line === "readyok");
		},

		async analyzePosition(fen: string, depth: number): Promise<PositionEval> {
			sendCommand("ucinewgame");
			sendCommand("isready");
			await waitForLine((line) => line === "readyok");

			sendCommand(`position fen ${fen}`);
			sendCommand(`go depth ${depth}`);

			let bestInfo: ParsedInfo | null = null;

			return new Promise<PositionEval>((resolve, reject) => {
				const timeout = setTimeout(() => {
					removeLineListener(handler);
					reject(new Error(`Stockfish analysis timeout for position: ${fen}`));
				}, 60000);

				function handler(line: string) {
					if (line.startsWith("info ")) {
						const parsed = parseInfoLine(line);
						if (parsed && parsed.pv.length > 0) {
							if (!bestInfo || parsed.depth >= bestInfo.depth) {
								bestInfo = parsed;
							}
						}
					} else if (line.startsWith("bestmove ")) {
						clearTimeout(timeout);
						removeLineListener(handler);

						if (!bestInfo || bestInfo.pv.length === 0) {
							// Terminal position (checkmate or stalemate) — resolve with game-over eval
							const chess = new Chess(fen);
							let terminalEvalCp: number;
							if (chess.isCheckmate()) {
								// Side to move is checkmated; normalize to white's perspective
								const isBlackToMove = fen.split(" ")[1] === "b";
								terminalEvalCp = isBlackToMove ? 99999 : -99999;
							} else {
								// Stalemate or other terminal draw
								terminalEvalCp = 0;
							}
							resolve({
								eval_cp: terminalEvalCp,
								best_move_uci: "",
								best_move_san: "",
								depth: 0,
								is_mate: chess.isCheckmate(),
								mate_in: chess.isCheckmate() ? 0 : null,
							});
							return;
						}

						const isMate = bestInfo.scoreMate !== null;
						const rawEvalCp = isMate
							? mateScoreToCp(bestInfo.scoreMate as number)
							: (bestInfo.scoreCp as number);
						// Stockfish returns eval from side-to-move perspective; normalize to white's perspective
						const isBlackToMove = fen.split(" ")[1] === "b";
						const evalCp = isBlackToMove ? -rawEvalCp : rawEvalCp;

						const bestMoveUci = bestInfo.pv[0];
						const bestMoveSan = uciToSan(fen, bestMoveUci);

						resolve({
							eval_cp: evalCp,
							best_move_uci: bestMoveUci,
							best_move_san: bestMoveSan,
							depth: bestInfo.depth,
							is_mate: isMate,
							mate_in: bestInfo.scoreMate,
						});
					}
				}

				onLine(handler);
			});
		},

		async destroy(): Promise<void> {
			if (process) {
				try {
					sendCommand("quit");
				} catch {
					// Process may already be dead
				}
				process.kill();
				process = null;
			}
			lineListeners = [];
			outputBuffer = "";
		},
	};
}
