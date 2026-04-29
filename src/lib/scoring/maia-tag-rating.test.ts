import { describe, expect, it, vi } from "vitest";
import type { MaiaOutput, PositionCache } from "#/lib/position-cache";
import type { Db } from "#/lib/position-cache/types";
import { computeMaiaTagRatings } from "./maia-tag-rating";

// ── Helpers ─────────────────────────────────────────────────────────────

const RATING_GRID = [1200, 1500, 1800];
const MOVE_INDEX = ["e2e4", "d2d4"];

function makeMaiaOutput(probs?: number[]): MaiaOutput {
	return {
		ratingGrid: RATING_GRID,
		moveIndex: MOVE_INDEX,
		probabilities: new Float32Array(probs ?? [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
	};
}

const PLAYER_ID = "00000000-0000-0000-0000-000000000001";
const GAME_ID_1 = "00000000-0000-0000-0000-000000000010";

function makeDbWithWindowAndRows(
	windowGameIds: string[],
	taggedRows: { fen: string; uci: string; dimensionValue: string }[],
): Db {
	let callCount = 0;
	const db = {
		select: vi.fn(() => {
			callCount++;
			// First call → window query (returns game rows)
			if (callCount === 1) {
				const chain = {
					from: vi.fn().mockReturnThis(),
					where: vi.fn().mockReturnThis(),
					orderBy: vi.fn().mockReturnThis(),
					limit: vi.fn().mockResolvedValue(windowGameIds.map((id) => ({ id }))),
				};
				return chain;
			}
			// Second call → tagged positions query
			const chain = {
				from: vi.fn().mockReturnThis(),
				innerJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue(taggedRows),
			};
			return chain;
		}),
	} as unknown as Db;
	return db;
}

function makeCache(fenToOutput: Map<string, MaiaOutput>): PositionCache {
	const getMaiaBatchMock = vi.fn().mockResolvedValue(fenToOutput);
	return {
		getMaiaBatch: getMaiaBatchMock,
	} as unknown as PositionCache;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("computeMaiaTagRatings", () => {
	it("returns empty array when no games in window", async () => {
		const db = makeDbWithWindowAndRows([], []);
		const cache = makeCache(new Map());

		const result = await computeMaiaTagRatings(db, cache, {
			playerId: PLAYER_ID,
			dimensionType: "piece",
		});

		expect(result).toEqual([]);
	});

	it("returns empty array when no tagged positions", async () => {
		const db = makeDbWithWindowAndRows([GAME_ID_1], []);
		const cache = makeCache(new Map());

		const result = await computeMaiaTagRatings(db, cache, {
			playerId: PLAYER_ID,
			dimensionType: "piece",
		});

		expect(result).toEqual([]);
	});

	it("returns one entry per dimension value with single getMaiaBatch call", async () => {
		const taggedRows = [
			{ fen: "fen1", uci: "e2e4", dimensionValue: "pawn" },
			{ fen: "fen2", uci: "d7d5", dimensionValue: "queen" },
		];
		const db = makeDbWithWindowAndRows([GAME_ID_1], taggedRows);

		const maiaMap = new Map([
			["fen1", makeMaiaOutput()],
			["fen2", makeMaiaOutput()],
		]);
		const cache = makeCache(maiaMap);

		const result = await computeMaiaTagRatings(db, cache, {
			playerId: PLAYER_ID,
			dimensionType: "piece",
		});

		expect(result).toHaveLength(2);
		const dimValues = result.map((r) => r.dimensionValue).sort();
		expect(dimValues).toEqual(["pawn", "queen"]);
		// Only one batch call
		expect(cache.getMaiaBatch).toHaveBeenCalledTimes(1);
		// Both fens passed in single call
		const callArg = (cache.getMaiaBatch as ReturnType<typeof vi.fn>).mock
			.calls[0][0] as string[];
		expect(callArg.sort()).toEqual(["fen1", "fen2"]);
	});

	it("returns single entry when dimensionValue is specified", async () => {
		const taggedRows = [{ fen: "fen1", uci: "e2e4", dimensionValue: "pawn" }];
		const db = makeDbWithWindowAndRows([GAME_ID_1], taggedRows);
		const maiaMap = new Map([["fen1", makeMaiaOutput()]]);
		const cache = makeCache(maiaMap);

		const result = await computeMaiaTagRatings(db, cache, {
			playerId: PLAYER_ID,
			dimensionType: "piece",
			dimensionValue: "pawn",
		});

		expect(result).toHaveLength(1);
		expect(result[0].dimensionValue).toBe("pawn");
		expect(result[0].nPositions).toBe(1);
	});

	it("skips positions with missing Maia cache; omits value if all positions missing", async () => {
		const taggedRows = [
			{ fen: "fen-missing", uci: "e2e4", dimensionValue: "pawn" },
			{ fen: "fen-present", uci: "d7d5", dimensionValue: "queen" },
		];
		const db = makeDbWithWindowAndRows([GAME_ID_1], taggedRows);
		// Only fen-present in cache
		const maiaMap = new Map([["fen-present", makeMaiaOutput()]]);
		const cache = makeCache(maiaMap);

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		const result = await computeMaiaTagRatings(db, cache, {
			playerId: PLAYER_ID,
			dimensionType: "piece",
		});

		// "pawn" omitted (all positions missing), "queen" included
		expect(result).toHaveLength(1);
		expect(result[0].dimensionValue).toBe("queen");
		expect(warnSpy).toHaveBeenCalled();
		warnSpy.mockRestore();
	});

	it("each result has predicted, ciLow, ciHigh, nPositions", async () => {
		const taggedRows = [{ fen: "fen1", uci: "e2e4", dimensionValue: "pawn" }];
		const db = makeDbWithWindowAndRows([GAME_ID_1], taggedRows);
		const maiaMap = new Map([["fen1", makeMaiaOutput()]]);
		const cache = makeCache(maiaMap);

		const [result] = await computeMaiaTagRatings(db, cache, {
			playerId: PLAYER_ID,
			dimensionType: "piece",
		});

		expect(typeof result.predicted).toBe("number");
		expect(typeof result.ciLow).toBe("number");
		expect(typeof result.ciHigh).toBe("number");
		expect(result.nPositions).toBe(1);
	});
});
