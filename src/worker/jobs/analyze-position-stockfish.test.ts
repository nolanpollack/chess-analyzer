import { describe, expect, it, vi } from "vitest";

// Mock Drizzle connection
vi.mock("drizzle-orm/node-postgres", () => ({
	drizzle: vi.fn(() => ({})),
}));

// Mock the position cache
const mockHasStockfish = vi.fn();
const mockPutStockfish = vi.fn();
vi.mock("#/lib/position-cache", () => ({
	createPositionCache: vi.fn(() => ({
		hasStockfish: mockHasStockfish,
		putStockfish: mockPutStockfish,
	})),
}));

// Mock the Stockfish engine
const mockInit = vi.fn().mockResolvedValue(undefined);
const mockAnalyzePosition = vi.fn();
const mockDestroy = vi.fn().mockResolvedValue(undefined);

vi.mock("#/providers/stockfish-wasm-engine", () => ({
	createStockfishWasmEngine: vi.fn(() => ({
		init: mockInit,
		analyzePosition: mockAnalyzePosition,
		destroy: mockDestroy,
	})),
}));

const { registerAnalyzePositionStockfishJob, STOCKFISH_VERSION } = await import(
	"./analyze-position-stockfish"
);

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function makeJob(
	fen = START_FEN,
	stockfishVersion = STOCKFISH_VERSION,
	stockfishDepth = 18,
) {
	return { data: { fen, stockfishVersion, stockfishDepth } };
}

function getBossHandler(boss: ReturnType<typeof makeBoss>) {
	return boss.work.mock.calls[0][2] as (jobs: unknown[]) => Promise<void>;
}

function makeBoss() {
	return { work: vi.fn() };
}

describe("analyze-position-stockfish job", () => {
	it("is idempotent: skips engine and put when cache hit", async () => {
		mockHasStockfish.mockResolvedValue(true);
		mockAnalyzePosition.mockReset();
		mockPutStockfish.mockReset();

		const boss = makeBoss();
		registerAnalyzePositionStockfishJob(
			boss as unknown as Parameters<
				typeof registerAnalyzePositionStockfishJob
			>[0],
		);

		const handler = getBossHandler(boss);
		await handler([makeJob()]);

		expect(mockAnalyzePosition).not.toHaveBeenCalled();
		expect(mockPutStockfish).not.toHaveBeenCalled();
	});

	it("happy path: runs engine and stores result with correct shape", async () => {
		mockHasStockfish.mockResolvedValue(false);
		mockPutStockfish.mockResolvedValue(undefined);

		const fakeResult = {
			eval_cp: 30,
			best_move_uci: "e2e4",
			best_move_san: "e4",
			depth: 18,
			is_mate: false,
			mate_in: null,
			pvs: [
				{ eval_cp: 30, move_uci: "e2e4", move_san: "e4" },
				{ eval_cp: 20, move_uci: "d2d4", move_san: "d4" },
				{ eval_cp: 10, move_uci: "g1f3", move_san: "Nf3" },
			],
		};
		mockAnalyzePosition.mockResolvedValue(fakeResult);

		const boss = makeBoss();
		registerAnalyzePositionStockfishJob(
			boss as unknown as Parameters<
				typeof registerAnalyzePositionStockfishJob
			>[0],
		);

		const handler = getBossHandler(boss);
		await handler([makeJob()]);

		expect(mockPutStockfish).toHaveBeenCalledOnce();
		const [, version, depth, output] = mockPutStockfish.mock.calls[0];

		expect(version).toBe(STOCKFISH_VERSION);
		expect(depth).toBe(18);
		expect(output.evalCp).toBe(30);
		expect(output.evalMate).toBeNull();
		expect(output.topMoves).toHaveLength(3);

		// Verify moves are in UCI notation
		expect(output.topMoves[0].move).toBe("e2e4");
		expect(output.topMoves[1].move).toBe("d2d4");
		expect(output.topMoves[2].move).toBe("g1f3");
	});
});
