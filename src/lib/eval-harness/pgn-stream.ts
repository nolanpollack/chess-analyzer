import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as readline from "node:readline";
import type { Readable } from "node:stream";
import { applyEvalFilters } from "./filter";

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

function openZstdStream(filePath: string): Readable {
	const proc = spawn("zstdcat", [filePath], {
		stdio: ["ignore", "pipe", "pipe"],
	});
	proc.stderr.on("data", (d: Buffer) => {
		process.stderr.write(`zstdcat: ${d}`);
	});
	return proc.stdout as Readable;
}

function openPlainStream(filePath: string): Readable {
	return fs.createReadStream(filePath, { encoding: "utf8" }) as Readable;
}

/**
 * Async generator that yields filtered games from a PGN file.
 * Supports plain .pgn and zstd-compressed .pgn.zst files.
 * Only yields games that pass applyEvalFilters.
 */
export async function* streamFilteredGames(
	filePath: string,
): AsyncGenerator<RawGame> {
	const readable = filePath.endsWith(".zst")
		? openZstdStream(filePath)
		: openPlainStream(filePath);

	for await (const game of streamGamesFromReadable(readable)) {
		if (applyEvalFilters(game.headers, game.plyCount)) {
			yield game;
		}
	}
}
