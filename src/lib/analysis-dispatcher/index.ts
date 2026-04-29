import type { PositionCache } from "#/lib/position-cache";
import { ensureQueue, getBoss } from "#/lib/queue";
import {
	ANALYZE_POSITION_MAIA,
	ANALYZE_POSITION_STOCKFISH,
	type AnalyzePositionMaiaPayload,
	type AnalyzePositionStockfishPayload,
} from "./job-names";
import type { AnalysisVersions, EnsureAnalyzedOptions } from "./types";

export type { AnalysisVersions, EnsureAnalyzedOptions };
export { ANALYZE_POSITION_MAIA, ANALYZE_POSITION_STOCKFISH };
export type {
	AnalyzePositionMaiaPayload,
	AnalyzePositionStockfishPayload,
} from "./job-names";

const DEFAULT_WAIT_TIMEOUT_MS = 600_000;
const DEFAULT_POLL_INTERVAL_MS = 200;

export class AnalysisDispatcherTimeoutError extends Error {
	constructor(public readonly unfinishedCount: number) {
		super(
			`Analysis dispatcher timed out with ${unfinishedCount} FEN(s) still pending.`,
		);
		this.name = "AnalysisDispatcherTimeoutError";
	}
}

function deduplicateFens(fens: string[]): string[] {
	return [...new Set(fens)];
}

function maiaJobKey(fen: string, maiaVersion: string): string {
	return `maia:${fen}:${maiaVersion}`;
}

function stockfishJobKey(
	fen: string,
	stockfishVersion: string,
	stockfishDepth: number,
): string {
	return `stockfish:${fen}:${stockfishVersion}:${stockfishDepth}`;
}

async function findMissingMaia(
	fens: string[],
	versions: AnalysisVersions,
	cache: PositionCache,
): Promise<string[]> {
	const present = await cache.getMaiaBatch(fens, versions.maiaVersion);
	return fens.filter((fen) => !present.has(fen));
}

async function findMissingStockfish(
	fens: string[],
	versions: AnalysisVersions,
	cache: PositionCache,
): Promise<string[]> {
	const present = await cache.getStockfishBatch(
		fens,
		versions.stockfishVersion,
		versions.stockfishDepth,
	);
	return fens.filter((fen) => !present.has(fen));
}

async function enqueueMaiaJobs(
	fens: string[],
	versions: AnalysisVersions,
): Promise<void> {
	if (fens.length === 0) return;
	await ensureQueue(ANALYZE_POSITION_MAIA);
	const boss = await getBoss();
	await Promise.all(
		fens.map((fen) => {
			const payload: AnalyzePositionMaiaPayload = {
				fen,
				maiaVersion: versions.maiaVersion,
			};
			return boss.send(ANALYZE_POSITION_MAIA, payload, {
				singletonKey: maiaJobKey(fen, versions.maiaVersion),
				retryLimit: 3,
				retryBackoff: true,
			});
		}),
	);
}

async function enqueueStockfishJobs(
	fens: string[],
	versions: AnalysisVersions,
): Promise<void> {
	if (fens.length === 0) return;
	await ensureQueue(ANALYZE_POSITION_STOCKFISH);
	const boss = await getBoss();
	await Promise.all(
		fens.map((fen) => {
			const payload: AnalyzePositionStockfishPayload = {
				fen,
				stockfishVersion: versions.stockfishVersion,
				stockfishDepth: versions.stockfishDepth,
			};
			return boss.send(ANALYZE_POSITION_STOCKFISH, payload, {
				singletonKey: stockfishJobKey(
					fen,
					versions.stockfishVersion,
					versions.stockfishDepth,
				),
				retryLimit: 3,
				retryBackoff: true,
			});
		}),
	);
}

function countUnfinished(
	fens: string[],
	maiaPresent: Map<string, unknown>,
	sfPresent: Map<string, unknown> | null,
): number {
	return fens.filter(
		(fen) =>
			!maiaPresent.has(fen) || (sfPresent !== null && !sfPresent.has(fen)),
	).length;
}

async function fetchPresentMaps(
	fens: string[],
	versions: AnalysisVersions,
	cache: PositionCache,
	skipStockfish: boolean,
): Promise<[Map<string, unknown>, Map<string, unknown> | null]> {
	if (skipStockfish) {
		const maiaPresent = await cache.getMaiaBatch(fens, versions.maiaVersion);
		return [maiaPresent, null];
	}
	const [maiaPresent, sfPresent] = await Promise.all([
		cache.getMaiaBatch(fens, versions.maiaVersion),
		cache.getStockfishBatch(
			fens,
			versions.stockfishVersion,
			versions.stockfishDepth,
		),
	]);
	return [maiaPresent, sfPresent];
}

function allComplete(
	fens: string[],
	maiaPresent: Map<string, unknown>,
	sfPresent: Map<string, unknown> | null,
): boolean {
	return fens.every(
		(fen) => maiaPresent.has(fen) && (sfPresent === null || sfPresent.has(fen)),
	);
}

async function pollUntilComplete(
	fens: string[],
	versions: AnalysisVersions,
	cache: PositionCache,
	waitTimeoutMs: number,
	pollIntervalMs: number,
	skipStockfish: boolean,
): Promise<void> {
	const deadline = Date.now() + waitTimeoutMs;

	while (Date.now() < deadline) {
		const [maiaPresent, sfPresent] = await fetchPresentMaps(
			fens,
			versions,
			cache,
			skipStockfish,
		);

		if (allComplete(fens, maiaPresent, sfPresent)) {
			return;
		}

		const remaining = deadline - Date.now();
		if (remaining <= 0) break;

		await new Promise((resolve) =>
			setTimeout(resolve, Math.min(pollIntervalMs, remaining)),
		);
	}

	// Final check after timeout to get accurate unfinished count
	const [maiaPresent, sfPresent] = await fetchPresentMaps(
		fens,
		versions,
		cache,
		skipStockfish,
	);
	const unfinished = countUnfinished(fens, maiaPresent, sfPresent);
	throw new AnalysisDispatcherTimeoutError(unfinished);
}

export async function ensureAnalyzed(
	fens: string[],
	versions: AnalysisVersions,
	cache: PositionCache,
	opts?: EnsureAnalyzedOptions,
): Promise<void> {
	const unique = deduplicateFens(fens);
	if (unique.length === 0) return;

	const skipSf = opts?.skipStockfish ?? false;

	const missingMaia = await findMissingMaia(unique, versions, cache);
	const missingStockfish = skipSf
		? []
		: await findMissingStockfish(unique, versions, cache);

	await Promise.all([
		enqueueMaiaJobs(missingMaia, versions),
		...(skipSf ? [] : [enqueueStockfishJobs(missingStockfish, versions)]),
	]);

	if (opts?.wait) {
		await pollUntilComplete(
			unique,
			versions,
			cache,
			opts.waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS,
			opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
			skipSf,
		);
	}
}
