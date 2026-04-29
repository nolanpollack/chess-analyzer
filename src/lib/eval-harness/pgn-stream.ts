import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as readline from "node:readline";
import type { Readable } from "node:stream";
import { applyEvalFilters } from "./filter";

function isUrl(s: string): boolean {
	return s.startsWith("http://") || s.startsWith("https://");
}

export type RawGame = {
	headers: Record<string, string>;
	pgn: string;
	plyCount: number;
};

function parseHeaders(lines: string[]): Record<string, string> {
	const headers: Record<string, string> = {};
	for (const line of lines) {
		const m = line.match(/^\[(\w+)\s+"([^"]*)"\]$/);
		if (m) headers[m[1]] = m[2];
	}
	return headers;
}

function countPlies(movesText: string): number {
	// Remove comments and annotations, then count half-moves
	const cleaned = movesText
		.replace(/\{[^}]*\}/g, "")
		.replace(/\([^)]*\)/g, "")
		.replace(/\$\d+/g, "")
		.replace(/\d+\.\.\./g, "")
		.replace(/\d+\./g, "");
	const tokens = cleaned.trim().split(/\s+/).filter(Boolean);
	// Remove result token at end
	const resultRegex = /^(1-0|0-1|1\/2-1\/2|\*)$/;
	return tokens.filter((t) => !resultRegex.test(t)).length;
}

async function* streamGamesFromReadable(
	readable: Readable,
): AsyncGenerator<RawGame> {
	const rl = readline.createInterface({ input: readable, crlfDelay: Infinity });

	let headerLines: string[] = [];
	let moveLines: string[] = [];
	let inMoves = false;

	for await (const line of rl) {
		if (line.startsWith("[")) {
			if (inMoves && moveLines.length > 0) {
				// Emit previous game
				const headers = parseHeaders(headerLines);
				const movesText = moveLines.join(" ");
				const plyCount = countPlies(movesText);
				const fullPgn = headerLines.join("\n") + "\n\n" + movesText;
				yield { headers, pgn: fullPgn, plyCount };
				headerLines = [];
				moveLines = [];
				inMoves = false;
			}
			headerLines.push(line);
		} else if (line.trim() === "") {
			if (headerLines.length > 0 && !inMoves) {
				inMoves = true;
			}
		} else if (inMoves) {
			moveLines.push(line);
		}
	}

	// Emit last game
	if (headerLines.length > 0 && moveLines.length > 0) {
		const headers = parseHeaders(headerLines);
		const movesText = moveLines.join(" ");
		const plyCount = countPlies(movesText);
		const fullPgn = headerLines.join("\n") + "\n\n" + movesText;
		yield { headers, pgn: fullPgn, plyCount };
	}
}

type ProcStream = { readable: Readable; cleanup: () => void };

function openZstdStream(filePath: string): ProcStream {
	const proc = spawn("zstdcat", [filePath], {
		stdio: ["ignore", "pipe", "pipe"],
	});
	proc.stderr.on("data", (d: Buffer) => {
		process.stderr.write(`zstdcat: ${d}`);
	});
	return {
		readable: proc.stdout as Readable,
		cleanup: () => killProcs(proc),
	};
}

function openPlainStream(filePath: string): ProcStream {
	return {
		readable: fs.createReadStream(filePath, { encoding: "utf8" }) as Readable,
		cleanup: () => {},
	};
}

/**
 * Stream a remote PGN URL via `curl | zstdcat`. curl writes to its stdout,
 * which is wired into zstdcat's stdin; we return zstdcat's stdout. When the
 * consumer stops reading, SIGPIPE propagates and both procs exit; cleanup()
 * is a belt-and-suspenders kill in case they don't.
 *
 * For non-zstd URLs (rare for Lichess), we just pipe curl's stdout straight
 * through.
 */
function openHttpStream(url: string): ProcStream {
	const isZstd = url.endsWith(".zst");
	const curl = spawn("curl", ["-sNL", "--fail", url], {
		stdio: ["ignore", "pipe", "pipe"],
	});
	curl.stderr.on("data", (d: Buffer) => {
		process.stderr.write(`curl: ${d}`);
	});

	if (!isZstd) {
		return {
			readable: curl.stdout as Readable,
			cleanup: () => killProcs(curl),
		};
	}

	const zstd = spawn("zstdcat", [], { stdio: ["pipe", "pipe", "pipe"] });
	zstd.stderr.on("data", (d: Buffer) => {
		process.stderr.write(`zstdcat: ${d}`);
	});
	if (curl.stdout && zstd.stdin) curl.stdout.pipe(zstd.stdin);

	return {
		readable: zstd.stdout as Readable,
		cleanup: () => killProcs(curl, zstd),
	};
}

function killProcs(...procs: ChildProcess[]): void {
	for (const p of procs) {
		if (p.exitCode === null && p.signalCode === null) {
			try {
				p.kill("SIGTERM");
			} catch {
				// already gone
			}
		}
	}
}

/**
 * Async generator that yields filtered games from a PGN source.
 * Supports plain .pgn and zstd .pgn.zst, on local disk OR via http(s) URL.
 * Remote sources are streamed (curl | zstdcat); no full download to disk.
 * Only yields games that pass applyEvalFilters.
 */
export async function* streamFilteredGames(
	source: string,
): AsyncGenerator<RawGame> {
	const stream = isUrl(source)
		? openHttpStream(source)
		: source.endsWith(".zst")
			? openZstdStream(source)
			: openPlainStream(source);

	try {
		for await (const game of streamGamesFromReadable(stream.readable)) {
			if (applyEvalFilters(game.headers, game.plyCount)) {
				yield game;
			}
		}
	} finally {
		stream.cleanup();
	}
}
