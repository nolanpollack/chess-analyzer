import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MaiaOutput } from "#/lib/position-cache";

// ── Mock #/lib/maia-direct-batch ──────────────────────────────────────────
const mockEnsureMaiaDirectBatch = vi
	.fn<() => Promise<Map<string, MaiaOutput>>>()
	.mockResolvedValue(new Map());
vi.mock("#/lib/maia-direct-batch", () => ({
	ensureMaiaDirectBatch: (...args: unknown[]) =>
		mockEnsureMaiaDirectBatch(...args),
}));

// ── Mock #/lib/scoring/maia-game-rating ───────────────────────────────────
const mockEstimateGameSideRating = vi.fn();
vi.mock("#/lib/scoring/maia-game-rating", async (importOriginal) => {
	const real =
		await importOriginal<typeof import("#/lib/scoring/maia-game-rating")>();
	return {
		...real,
		estimateGameSideRating: (...args: unknown[]) =>
			mockEstimateGameSideRating(...args),
	};
});

// Import subject AFTER mocks are registered
const { computeAndPersistMaiaRating } = await import("./maia-rating");

// ── Helpers ────────────────────────────────────────────────────────────────

function makeMaiaOutput(): MaiaOutput {
	return {
		ratingGrid: [1200, 1500, 1800],
		moveIndex: ["e2e4", "d2d4"],
		probabilities: new Float32Array([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
	};
}

function makeDb(maiaPredictedWhite: number | null = null) {
	const selectResult = [{ maiaPredictedWhite }];
	const updateSet = vi.fn().mockReturnThis();
	const updateWhere = vi.fn().mockResolvedValue(undefined);

	return {
		select: vi.fn().mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					limit: vi.fn().mockResolvedValue(selectResult),
				}),
			}),
		}),
		update: vi.fn().mockReturnValue({
			set: updateSet.mockReturnValue({ where: updateWhere }),
		}),
		_updateSet: updateSet,
		_updateWhere: updateWhere,
	} as unknown as Parameters<typeof computeAndPersistMaiaRating>[0]["db"];
}

function makeCache(maiaMap: Map<string, MaiaOutput> = new Map()) {
	return {
		getMaiaBatch: vi.fn().mockResolvedValue(maiaMap),
		hasMaia: vi.fn(),
		hasStockfish: vi.fn(),
		getStockfishBatch: vi.fn(),
		getPositionDataBatch: vi.fn(),
		putMaia: vi.fn(),
		putStockfish: vi.fn(),
	};
}

const WHITE_POSITIONS = [{ fen: "startpos", playedMove: "e2e4" }];
const BLACK_POSITIONS = [{ fen: "aftere4", playedMove: "e7e5" }];

// ── Tests ──────────────────────────────────────────────────────────────────

describe("computeAndPersistMaiaRating", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns early (no-op) when maiaPredictedWhite is already set", async () => {
		const db = makeDb(1450); // already populated
		const cache = makeCache();

		await computeAndPersistMaiaRating({
			db,
			cache,
			analysisJobId: "job-1",
			whitePositions: WHITE_POSITIONS,
			blackPositions: BLACK_POSITIONS,
		});

		expect(mockEnsureMaiaDirectBatch).not.toHaveBeenCalled();
	});

	it("happy path: calls ensureMaiaDirectBatch with unique fens and writes both sides", async () => {
		const db = makeDb(null); // not yet populated
		const fen1 = WHITE_POSITIONS[0].fen;
		const fen2 = BLACK_POSITIONS[0].fen;
		const maia = makeMaiaOutput();
		const maiaMap = new Map([
			[fen1, maia],
			[fen2, maia],
		]);
		const cache = makeCache();
		mockEnsureMaiaDirectBatch.mockResolvedValueOnce(maiaMap);

		const whiteResult = {
			side: "white" as const,
			predicted: 1400,
			ciLow: 1200,
			ciHigh: 1600,
			nPositions: 1,
		};
		const blackResult = {
			side: "black" as const,
			predicted: 1550,
			ciLow: 1350,
			ciHigh: 1750,
			nPositions: 1,
		};
		mockEstimateGameSideRating
			.mockReturnValueOnce(whiteResult)
			.mockReturnValueOnce(blackResult);

		await computeAndPersistMaiaRating({
			db,
			cache,
			analysisJobId: "job-2",
			whitePositions: WHITE_POSITIONS,
			blackPositions: BLACK_POSITIONS,
		});

		expect(mockEnsureMaiaDirectBatch).toHaveBeenCalledOnce();
		const [fensArg] = mockEnsureMaiaDirectBatch.mock.calls[0];
		expect(new Set(fensArg as string[])).toEqual(new Set([fen1, fen2]));

		const updateMock = (
			db as unknown as { _updateSet: ReturnType<typeof vi.fn> }
		)._updateSet;
		const setArg = updateMock.mock.calls[0][0];
		expect(setArg.maiaPredictedWhite).toBe(1400);
		expect(setArg.maiaPredictedBlack).toBe(1550);
		expect(setArg.maiaVersion).toBe("maia2-rapid-v1.0");
	});

	it("re-throws when ensureMaiaDirectBatch throws, so pg-boss can retry", async () => {
		const db = makeDb(null);
		const cache = makeCache();
		mockEnsureMaiaDirectBatch.mockRejectedValueOnce(new Error("sidecar down"));

		await expect(
			computeAndPersistMaiaRating({
				db,
				cache,
				analysisJobId: "job-3",
				whitePositions: WHITE_POSITIONS,
				blackPositions: BLACK_POSITIONS,
			}),
		).rejects.toThrow("sidecar down");
	});
});
