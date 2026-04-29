import { describe, expect, it, vi } from "vitest";
import type { MaiaOutput, PositionCache } from "#/lib/position-cache";
import { evaluateGame } from "./evaluate-game";
import type { ParsedGame } from "./game-to-positions";

// Mock the analysis dispatcher
vi.mock("#/lib/analysis-dispatcher", () => ({
	ensureAnalyzed: vi.fn().mockResolvedValue(undefined),
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

function makeCache(maiaMap: Map<string, MaiaOutput>): PositionCache {
	return {
		hasMaia: vi.fn(),
		hasStockfish: vi.fn(),
		getMaiaBatch: vi.fn().mockResolvedValue(maiaMap),
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

describe("evaluateGame", () => {
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
		});

		expect(rows[0].gameId).toBe("testgame1");
		expect(rows[0].trueRating).toBe(1500);
		expect(rows[0].opponentRating).toBe(1600);
		expect(rows[0].timeControlClass).toBe("blitz");
		expect(rows[0].nPositions).toBe(2);
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
		});

		// Should only have white row (black has no maia data → 0 positions)
		expect(rows).toHaveLength(1);
		expect(rows[0].side).toBe("white");
	});
});
