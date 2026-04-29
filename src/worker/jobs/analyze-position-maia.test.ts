import { describe, expect, it, vi } from "vitest";

// Mock the worker DB singleton so tests don't need a real DATABASE_URL
vi.mock("#/worker/db", () => ({
	getWorkerDb: vi.fn(() => ({})),
}));

// Mock the position cache
const mockHasMaia = vi.fn();
const mockPutMaia = vi.fn();
vi.mock("#/lib/position-cache", () => ({
	createPositionCache: vi.fn(() => ({
		hasMaia: mockHasMaia,
		putMaia: mockPutMaia,
	})),
}));

// Mock inferMaia
const mockInferMaia = vi.fn();
vi.mock("#/lib/maia-client", () => ({
	inferMaia: mockInferMaia,
}));

// Import after mocks are set up
const { registerAnalyzePositionMaiaJob } = await import(
	"./analyze-position-maia"
);

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MAIA_VERSION = "maia2";

function makeJob(fen = START_FEN, maiaVersion = MAIA_VERSION) {
	return { data: { fen, maiaVersion } };
}

function makeBoss() {
	return {
		work: vi.fn(),
	};
}

describe("analyze-position-maia job", () => {
	it("is idempotent: skips fetch and put when cache hit", async () => {
		mockHasMaia.mockResolvedValue(true);
		mockInferMaia.mockReset();
		mockPutMaia.mockReset();

		const boss = makeBoss();
		registerAnalyzePositionMaiaJob(
			boss as unknown as Parameters<typeof registerAnalyzePositionMaiaJob>[0],
		);

		// Invoke the handler directly
		const handler = boss.work.mock.calls[0][2] as (
			jobs: unknown[],
		) => Promise<void>;
		await handler([makeJob()]);

		expect(mockInferMaia).not.toHaveBeenCalled();
		expect(mockPutMaia).not.toHaveBeenCalled();
	});

	it("happy path: calls inferMaia and putMaia with correct Float32Array", async () => {
		mockHasMaia.mockResolvedValue(false);
		mockPutMaia.mockResolvedValue(undefined);

		// 2 ratings × 3 moves
		const ratingGrid = [1100, 1200];
		const moveIndex = ["e2e4", "d2d4", "g1f3"];
		const probabilities = [
			[0.5, 0.3, 0.2],
			[0.4, 0.4, 0.2],
		];
		mockInferMaia.mockResolvedValue({
			maiaVersion: MAIA_VERSION,
			ratingGrid,
			moveIndex,
			probabilities,
		});

		const boss = makeBoss();
		registerAnalyzePositionMaiaJob(
			boss as unknown as Parameters<typeof registerAnalyzePositionMaiaJob>[0],
		);

		const handler = boss.work.mock.calls[0][2] as (
			jobs: unknown[],
		) => Promise<void>;
		await handler([makeJob()]);

		expect(mockPutMaia).toHaveBeenCalledOnce();
		const [, , output] = mockPutMaia.mock.calls[0];

		expect(output.ratingGrid).toEqual(ratingGrid);
		expect(output.moveIndex).toEqual(moveIndex);

		// Verify Float32Array byte-correctness: 2 ratings × 3 moves = 6 elements
		expect(output.probabilities).toBeInstanceOf(Float32Array);
		expect(output.probabilities.length).toBe(6);

		// Row-major: [r0m0, r0m1, r0m2, r1m0, r1m1, r1m2]
		expect(output.probabilities[0]).toBeCloseTo(0.5);
		expect(output.probabilities[1]).toBeCloseTo(0.3);
		expect(output.probabilities[2]).toBeCloseTo(0.2);
		expect(output.probabilities[3]).toBeCloseTo(0.4);
		expect(output.probabilities[4]).toBeCloseTo(0.4);
		expect(output.probabilities[5]).toBeCloseTo(0.2);
	});

	it("throws when service returns a different maiaVersion", async () => {
		mockHasMaia.mockResolvedValue(false);
		mockInferMaia.mockResolvedValue({
			maiaVersion: "maia1", // mismatch
			ratingGrid: [1100],
			moveIndex: ["e2e4"],
			probabilities: [[1.0]],
		});

		const boss = makeBoss();
		registerAnalyzePositionMaiaJob(
			boss as unknown as Parameters<typeof registerAnalyzePositionMaiaJob>[0],
		);

		const handler = boss.work.mock.calls[0][2] as (
			jobs: unknown[],
		) => Promise<void>;
		await expect(handler([makeJob()])).rejects.toThrow(/version mismatch/i);
	});
});
