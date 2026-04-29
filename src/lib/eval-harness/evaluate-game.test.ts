import { describe, expect, it, vi } from "vitest";
import { inferMaiaBatch } from "#/lib/maia-client";
import type { MaiaOutput, PositionCache } from "#/lib/position-cache";
import { evaluateGame } from "./evaluate-game";
import type { ParsedGame } from "./game-to-positions";

// Mock the analysis dispatcher
vi.mock("#/lib/analysis-dispatcher", () => ({
	ensureAnalyzed: vi.fn().mockResolvedValue(undefined),
}));

// Mock the maia client
vi.mock("#/lib/maia-client", () => ({
	inferMaiaBatch: vi.fn(),
}));

const MOCK_RATING_GRID = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800];

function makeMaiaOutput(peakIdx: number): MaiaOutput {
	const probs = new Float32Array(MOCK_RATING_GRID.length);
	probs[peakIdx] = 0.9;
	for (let i = 0; i < probs.length; i++) {
		if (i !== peakIdx) probs[i] = 0.1 / (probs.length - 1);
	}
	return {
		ratingGrid: MOCK_RATING_GRID,
		moveIndex: ["e2e4", "d2d4", "g1f3"],
		probabilities: probs,
	};
}

function makeCache(
	maiaMap: Map<string, MaiaOutput>,
	initialHits?: Map<string, MaiaOutput>,
): PositionCache {
	// First call to getMaiaBatch (pre-analysis cache check) returns initialHits if provided
	const getMaiaBatch = initialHits
		? vi.fn().mockResolvedValueOnce(initialHits).mockResolvedValue(maiaMap)
		: vi.fn().mockResolvedValue(maiaMap);
	return {
		hasMaia: vi.fn(),
		hasStockfish: vi.fn(),
		getMaiaBatch,
		getStockfishBatch: vi.fn().mockResolvedValue(new Map()),
		getPositionDataBatch: vi.fn(),
		putMaia: vi.fn(),
		putStockfish: vi.fn(),
	} as unknown as PositionCache;
}

const MOCK_GAME: ParsedGame = {
	gameId: "testgame1",
	white: {
		side: "white",
		trueRating: 1500,
		opponentRating: 1600,
		timeControlClass: "blitz",
		positions: [
			{
				fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
				playedMove: "e2e4",
			},
			{
				fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
				playedMove: "g1f3",
			},
		],
	},
	black: {
		side: "black",
		trueRating: 1600,
		opponentRating: 1500,
		timeControlClass: "blitz",
		positions: [
			{
				fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
				playedMove: "e7e5",
			},
		],
	},
};

describe("evaluateGame (queue path)", () => {
	it("returns two EvalRows for a game with both sides having positions", async () => {
		const maiaMap = new Map<string, MaiaOutput>();
		for (const pos of [
			...MOCK_GAME.white.positions,
			...MOCK_GAME.black.positions,
		]) {
			maiaMap.set(pos.fen, makeMaiaOutput(5)); // peak at 1500
		}

		const cache = makeCache(maiaMap);
		const rows = await evaluateGame(MOCK_GAME, cache, {
			versions: {
				maiaVersion: "maia-1500",
				stockfishVersion: "sf18",
				stockfishDepth: 18,
			},
			epsilon: 1e-6,
			prior: "uniform",
			waitTimeoutMs: 5000,
			directBatch: false,
		});

		expect(rows).toHaveLength(2);
		expect(rows[0].side).toBe("white");
		expect(rows[1].side).toBe("black");
	});

	it("sets withinCi correctly", async () => {
		const maiaMap = new Map<string, MaiaOutput>();
		for (const pos of [
			...MOCK_GAME.white.positions,
			...MOCK_GAME.black.positions,
		]) {
			maiaMap.set(pos.fen, makeMaiaOutput(5));
		}

		const cache = makeCache(maiaMap);
		const rows = await evaluateGame(MOCK_GAME, cache, {
			versions: {
				maiaVersion: "maia-1500",
				stockfishVersion: "sf18",
				stockfishDepth: 18,
			},
			epsilon: 1e-6,
			prior: "uniform",
			waitTimeoutMs: 5000,
			directBatch: false,
		});

		for (const row of rows) {
			const expectedWithin =
				row.trueRating >= row.ciLow && row.trueRating <= row.ciHigh;
			expect(row.withinCi).toBe(expectedWithin);
		}
	});

	it("records correct metadata on each row", async () => {
		const maiaMap = new Map<string, MaiaOutput>();
		for (const pos of [
			...MOCK_GAME.white.positions,
			...MOCK_GAME.black.positions,
		]) {
			maiaMap.set(pos.fen, makeMaiaOutput(5));
		}

		const cache = makeCache(maiaMap);
		const rows = await evaluateGame(MOCK_GAME, cache, {
			versions: {
				maiaVersion: "maia-1500",
				stockfishVersion: "sf18",
				stockfishDepth: 18,
			},
			epsilon: 1e-6,
			prior: "uniform",
			waitTimeoutMs: 5000,
			directBatch: false,
		});

		expect(rows[0].gameId).toBe("testgame1");
		expect(rows[0].trueRating).toBe(1500);
		expect(rows[0].opponentRating).toBe(1600);
		expect(rows[0].timeControlClass).toBe("blitz");
		expect(rows[0].nPositions).toBe(2);
	});

	it("records cache stats on each row", async () => {
		const allPositions = [
			...MOCK_GAME.white.positions,
			...MOCK_GAME.black.positions,
		];
		const maiaMap = new Map<string, MaiaOutput>();
		for (const pos of allPositions) {
			maiaMap.set(pos.fen, makeMaiaOutput(5));
		}
		// Pre-analysis: only one FEN is already cached
		const initialHits = new Map<string, MaiaOutput>();
		initialHits.set(allPositions[0].fen, makeMaiaOutput(5));

		const cache = makeCache(maiaMap, initialHits);
		const rows = await evaluateGame(MOCK_GAME, cache, {
			versions: {
				maiaVersion: "maia-1500",
				stockfishVersion: "sf18",
				stockfishDepth: 18,
			},
			epsilon: 1e-6,
			prior: "uniform",
			waitTimeoutMs: 5000,
			directBatch: false,
		});

		// 3 unique FENs total (2 white + 1 black), 1 pre-cached
		expect(rows[0].uniquePositions).toBe(3);
		expect(rows[0].cacheHits).toBe(1);
		expect(rows[0].cacheMisses).toBe(2);
		// Stats are repeated on both side rows
		expect(rows[1].cacheHits).toBe(1);
	});

	it("skips a side if no maia data is available", async () => {
		// Only provide maia data for white
		const maiaMap = new Map<string, MaiaOutput>();
		for (const pos of MOCK_GAME.white.positions) {
			maiaMap.set(pos.fen, makeMaiaOutput(5));
		}
		// black positions get no maia data

		const cache = makeCache(maiaMap);
		const rows = await evaluateGame(MOCK_GAME, cache, {
			versions: {
				maiaVersion: "maia-1500",
				stockfishVersion: "sf18",
				stockfishDepth: 18,
			},
			epsilon: 1e-6,
			prior: "uniform",
			waitTimeoutMs: 5000,
			directBatch: false,
		});

		// Should only have white row (black has no maia data → 0 positions)
		expect(rows).toHaveLength(1);
		expect(rows[0].side).toBe("white");
	});
});

describe("evaluateGame (directBatch path)", () => {
	it("all-cached input: no inferMaiaBatch call", async () => {
		vi.mocked(inferMaiaBatch).mockClear();

		const maiaMap = new Map<string, MaiaOutput>();
		for (const pos of [
			...MOCK_GAME.white.positions,
			...MOCK_GAME.black.positions,
		]) {
			maiaMap.set(pos.fen, makeMaiaOutput(5));
		}

		const cache = makeCache(maiaMap);
		const rows = await evaluateGame(MOCK_GAME, cache, {
			versions: {
				maiaVersion: "maia-1500",
				stockfishVersion: "sf18",
				stockfishDepth: 18,
			},
			epsilon: 1e-6,
			prior: "uniform",
			waitTimeoutMs: 5000,
			directBatch: true,
			skipStockfish: true,
		});

		// All FENs were in cache — inferMaiaBatch should not have been called
		expect(vi.mocked(inferMaiaBatch)).not.toHaveBeenCalled();
		expect(rows).toHaveLength(2);
	});

	it("all-miss input: calls inferMaiaBatch with the right FEN list and writes to cache", async () => {
		vi.mocked(inferMaiaBatch).mockClear();

		const allPositions = [
			...MOCK_GAME.white.positions,
			...MOCK_GAME.black.positions,
		];
		const uniqueFens = [...new Set(allPositions.map((p) => p.fen))];

		// Build a batch response matching the unique FENs
		const batchResults = uniqueFens.map((fen) => ({
			fen,
			moveIndex: ["e2e4", "d2d4", "g1f3"],
			probabilities: MOCK_RATING_GRID.map(() => [0.5, 0.3, 0.2]),
		}));

		vi.mocked(inferMaiaBatch).mockResolvedValueOnce({
			maiaVersion: "maia-1500",
			ratingGrid: MOCK_RATING_GRID,
			results: batchResults,
		});

		// Cache starts empty for the first getMaiaBatch (miss check), then returns
		// the populated map after putMaia calls
		const fullMaiaMap = new Map<string, MaiaOutput>();
		for (const pos of allPositions) {
			fullMaiaMap.set(pos.fen, makeMaiaOutput(5));
		}

		const emptyMap = new Map<string, MaiaOutput>();
		const cache: PositionCache = {
			hasMaia: vi.fn(),
			hasStockfish: vi.fn(),
			getMaiaBatch: vi
				.fn()
				// 1st call: countCacheHits (hitsBeforeAnalysis) → empty
				.mockResolvedValueOnce(emptyMap)
				// 2nd call: ensureMaiaDirectBatch miss check → empty (triggers inferMaiaBatch)
				.mockResolvedValueOnce(emptyMap)
				// 3rd+ calls: post-putMaia re-read → full data
				.mockResolvedValue(fullMaiaMap),
			getStockfishBatch: vi.fn().mockResolvedValue(new Map()),
			getPositionDataBatch: vi.fn(),
			putMaia: vi.fn().mockResolvedValue(undefined),
			putStockfish: vi.fn(),
		} as unknown as PositionCache;

		const rows = await evaluateGame(MOCK_GAME, cache, {
			versions: {
				maiaVersion: "maia-1500",
				stockfishVersion: "sf18",
				stockfishDepth: 18,
			},
			epsilon: 1e-6,
			prior: "uniform",
			waitTimeoutMs: 5000,
			directBatch: true,
			skipStockfish: true,
		});

		// inferMaiaBatch was called once with all unique missing FENs
		expect(vi.mocked(inferMaiaBatch)).toHaveBeenCalledTimes(1);
		const calledFens = vi.mocked(inferMaiaBatch).mock.calls[0][0];
		expect(calledFens.sort()).toEqual(uniqueFens.sort());

		// putMaia was called once per unique FEN result
		expect(vi.mocked(cache.putMaia)).toHaveBeenCalledTimes(uniqueFens.length);

		expect(rows).toHaveLength(2);
	});
});
