import { describe, expect, it, vi } from "vitest";

// Mock the worker DB singleton so tests don't need a real DATABASE_URL
const mockSelect = vi.fn();
vi.mock("#/worker/db", () => ({
	getWorkerDb: vi.fn(() => ({ select: mockSelect })),
}));

// Mock position cache
vi.mock("#/lib/position-cache", () => ({
	createPositionCache: vi.fn(() => ({})),
}));

// Mock computeAndPersistMaiaRating
const mockComputeAndPersistMaiaRating = vi.fn();
vi.mock("./maia-rating", () => ({
	computeAndPersistMaiaRating: mockComputeAndPersistMaiaRating,
}));

// A real PGN for a short game (4-move Scholar's mate variant)
const SAMPLE_PGN = `[Event "Test"]
[White "A"]
[Black "B"]
[Result "1-0"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0`;

// Build the chainable query mock: db.select().from().innerJoin().where().limit()
function buildDbMock(pgn: string | null) {
	const chain = {
		from: vi.fn().mockReturnThis(),
		innerJoin: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		limit: vi.fn().mockResolvedValue(pgn !== null ? [{ pgn }] : []),
	};
	mockSelect.mockReturnValue(chain);
	return chain;
}

const { registerAnalyzeGameMaiaJob } = await import("./analyze-game-maia");

function makeBoss() {
	return { work: vi.fn() };
}

function getBossHandler(boss: ReturnType<typeof makeBoss>) {
	return boss.work.mock.calls[0][2] as (
		jobs: { data: { gameId: string; analysisJobId: string } }[],
	) => Promise<void>;
}

describe("analyze-game-maia job", () => {
	it("happy path: walks PGN and calls computeAndPersistMaiaRating with extracted positions", async () => {
		buildDbMock(SAMPLE_PGN);
		mockComputeAndPersistMaiaRating.mockResolvedValue(undefined);

		const boss = makeBoss();
		registerAnalyzeGameMaiaJob(
			boss as unknown as Parameters<typeof registerAnalyzeGameMaiaJob>[0],
		);

		const handler = getBossHandler(boss);
		await handler([{ data: { gameId: "game-1", analysisJobId: "job-1" } }]);

		expect(mockComputeAndPersistMaiaRating).toHaveBeenCalledOnce();
		const opts = mockComputeAndPersistMaiaRating.mock.calls[0][0];
		expect(opts.analysisJobId).toBe("job-1");

		// Scholar's mate: 7 half-moves total — 4 white, 3 black
		expect(opts.whitePositions).toHaveLength(4);
		expect(opts.blackPositions).toHaveLength(3);

		// Every position entry must have fen + playedMove (uci)
		for (const pos of [...opts.whitePositions, ...opts.blackPositions]) {
			expect(typeof pos.fen).toBe("string");
			expect(pos.fen.length).toBeGreaterThan(0);
			expect(typeof pos.playedMove).toBe("string");
			expect(pos.playedMove.length).toBeGreaterThan(0);
		}
	});

	it("game not found: returns silently without calling computeAndPersistMaiaRating", async () => {
		buildDbMock(null);
		mockComputeAndPersistMaiaRating.mockReset();

		const boss = makeBoss();
		registerAnalyzeGameMaiaJob(
			boss as unknown as Parameters<typeof registerAnalyzeGameMaiaJob>[0],
		);

		const handler = getBossHandler(boss);
		await handler([
			{ data: { gameId: "game-stale", analysisJobId: "job-stale" } },
		]);

		expect(mockComputeAndPersistMaiaRating).not.toHaveBeenCalled();
	});

	it("re-throws when computeAndPersistMaiaRating fails so pg-boss can retry", async () => {
		buildDbMock(SAMPLE_PGN);
		mockComputeAndPersistMaiaRating.mockRejectedValue(
			new Error("maia inference failed"),
		);

		const boss = makeBoss();
		registerAnalyzeGameMaiaJob(
			boss as unknown as Parameters<typeof registerAnalyzeGameMaiaJob>[0],
		);

		const handler = getBossHandler(boss);
		await expect(
			handler([{ data: { gameId: "game-1", analysisJobId: "job-1" } }]),
		).rejects.toThrow("maia inference failed");
	});
});
