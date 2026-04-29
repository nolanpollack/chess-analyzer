import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock env before any imports that depend on it
vi.mock("#/env", () => ({
	env: { DATABASE_URL: "postgresql://localhost/test" },
}));

// Mock queue module — factory evaluated after hoisting
vi.mock("#/lib/queue", () => ({
	getBoss: vi.fn(),
	ensureQueue: vi.fn().mockResolvedValue(undefined),
}));

import type { PositionCache } from "#/lib/position-cache";
import { ensureQueue, getBoss } from "#/lib/queue";
import { AnalysisDispatcherTimeoutError, ensureAnalyzed } from "./index";
import type { AnalysisVersions } from "./types";

// --- Helpers ---

const VERSIONS: AnalysisVersions = {
	maiaVersion: "maia-1.0",
	stockfishVersion: "sf-18",
	stockfishDepth: 20,
};

const FEN1 = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const FEN2 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

function makeCache(maiaPresent: string[], sfPresent: string[]): PositionCache {
	const maiaMap = new Map(maiaPresent.map((f) => [f, {} as never]));
	const sfMap = new Map(sfPresent.map((f) => [f, {} as never]));
	return {
		hasMaia: vi.fn(),
		hasStockfish: vi.fn(),
		getMaiaBatch: vi.fn().mockResolvedValue(maiaMap),
		getStockfishBatch: vi.fn().mockResolvedValue(sfMap),
		getPositionDataBatch: vi.fn(),
		putMaia: vi.fn(),
		putStockfish: vi.fn(),
	};
}

let mockSend: ReturnType<typeof vi.fn>;

beforeEach(() => {
	vi.clearAllMocks();
	mockSend = vi.fn().mockResolvedValue(undefined);
	vi.mocked(getBoss).mockResolvedValue({ send: mockSend } as never);
	vi.mocked(ensureQueue).mockResolvedValue(undefined);
});

// --- Tests ---

describe("ensureAnalyzed", () => {
	it("no-op on empty input — does not enqueue or call cache", async () => {
		const cache = makeCache([], []);
		await ensureAnalyzed([], VERSIONS, cache);
		expect(cache.getMaiaBatch).not.toHaveBeenCalled();
		expect(cache.getStockfishBatch).not.toHaveBeenCalled();
		expect(mockSend).not.toHaveBeenCalled();
	});

	it("all cached — no jobs enqueued", async () => {
		const cache = makeCache([FEN1, FEN2], [FEN1, FEN2]);
		await ensureAnalyzed([FEN1, FEN2], VERSIONS, cache);
		expect(mockSend).not.toHaveBeenCalled();
	});

	it("some missing Maia, all stockfish present — enqueues only Maia jobs", async () => {
		const cache = makeCache([FEN1], [FEN1, FEN2]); // FEN2 missing from Maia
		await ensureAnalyzed([FEN1, FEN2], VERSIONS, cache);

		const maiaJobs = mockSend.mock.calls.filter(
			(c) => c[0] === "analyze-position-maia",
		);
		const sfJobs = mockSend.mock.calls.filter(
			(c) => c[0] === "analyze-position-stockfish",
		);

		expect(maiaJobs).toHaveLength(1);
		expect(maiaJobs[0][1]).toMatchObject({
			fen: FEN2,
			maiaVersion: "maia-1.0",
		});
		expect(maiaJobs[0][2]).toMatchObject({
			singletonKey: `maia:${FEN2}:maia-1.0`,
			retryLimit: 3,
			retryBackoff: true,
		});
		expect(sfJobs).toHaveLength(0);
	});

	it("some missing both — enqueues correct Maia and Stockfish jobs", async () => {
		const cache = makeCache([FEN1], [FEN1]); // FEN2 missing from both
		await ensureAnalyzed([FEN1, FEN2], VERSIONS, cache);

		const maiaJobs = mockSend.mock.calls.filter(
			(c) => c[0] === "analyze-position-maia",
		);
		const sfJobs = mockSend.mock.calls.filter(
			(c) => c[0] === "analyze-position-stockfish",
		);

		expect(maiaJobs).toHaveLength(1);
		expect(maiaJobs[0][1]).toMatchObject({
			fen: FEN2,
			maiaVersion: "maia-1.0",
		});

		expect(sfJobs).toHaveLength(1);
		expect(sfJobs[0][1]).toMatchObject({
			fen: FEN2,
			stockfishVersion: "sf-18",
			stockfishDepth: 20,
		});
		expect(sfJobs[0][2]).toMatchObject({
			singletonKey: `stockfish:${FEN2}:sf-18:20`,
			retryLimit: 3,
			retryBackoff: true,
		});
	});

	it("dedupes input FENs — issues at most one Maia job per unique FEN", async () => {
		const cache = makeCache([], []); // all missing
		await ensureAnalyzed([FEN1, FEN1, FEN2], VERSIONS, cache);

		const maiaJobs = mockSend.mock.calls.filter(
			(c) => c[0] === "analyze-position-maia",
		);
		const fen1Jobs = maiaJobs.filter((c) => c[1].fen === FEN1);
		expect(fen1Jobs).toHaveLength(1);
	});

	it("wait=true — polls until cache satisfied then resolves", async () => {
		vi.useFakeTimers();

		let callCount = 0;
		const getMaiaBatch = vi.fn().mockImplementation(() => {
			callCount++;
			if (callCount <= 2) return Promise.resolve(new Map()); // 1st: check missing, 2nd: first poll
			return Promise.resolve(new Map([[FEN1, {}]]));
		});
		const getStockfishBatch = vi.fn().mockImplementation(() => {
			if (callCount <= 2) return Promise.resolve(new Map());
			return Promise.resolve(new Map([[FEN1, {}]]));
		});

		const cache: PositionCache = {
			hasMaia: vi.fn(),
			hasStockfish: vi.fn(),
			getMaiaBatch,
			getStockfishBatch,
			getPositionDataBatch: vi.fn(),
			putMaia: vi.fn(),
			putStockfish: vi.fn(),
		};

		const promise = ensureAnalyzed([FEN1], VERSIONS, cache, {
			wait: true,
			pollIntervalMs: 500,
			waitTimeoutMs: 5000,
		});

		// Advance past the polling interval to allow second poll to satisfy
		await vi.advanceTimersByTimeAsync(600);
		await promise;

		vi.useRealTimers();
	});

	it("wait=true throws AnalysisDispatcherTimeoutError when timeout expires", async () => {
		vi.useFakeTimers();

		const cache = makeCache([], []); // always missing

		let caughtError: unknown;
		const promise = ensureAnalyzed([FEN1, FEN2], VERSIONS, cache, {
			wait: true,
			pollIntervalMs: 200,
			waitTimeoutMs: 500,
		}).catch((err) => {
			caughtError = err;
		});

		await vi.advanceTimersByTimeAsync(700);
		await promise;

		expect(caughtError).toBeInstanceOf(AnalysisDispatcherTimeoutError);
		expect(
			(caughtError as AnalysisDispatcherTimeoutError).unfinishedCount,
		).toBe(2);

		vi.useRealTimers();
	});
});
