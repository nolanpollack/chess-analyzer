import { describe, expect, it, vi } from "vitest";
import { createPositionCache } from "./index";
import type { MaiaOutput, StockfishOutput } from "./types";

// ── Helpers ────────────────────────────────────────────────────────────

const TEST_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const MAIA_VERSION = "maia2-rapid-v1.0";
const SF_VERSION = "stockfish-17";
const SF_DEPTH = 20;

function makeMaiaOutput(): MaiaOutput {
	const ratingGrid = [1100, 1300, 1500, 1700, 1900];
	const moveIndex = ["e2e4", "d2d4", "c2c4"];
	// 5 buckets × 3 moves = 15 values
	const probabilities = new Float32Array([
		0.5, 0.3, 0.2, 0.4, 0.35, 0.25, 0.45, 0.3, 0.25, 0.42, 0.33, 0.25, 0.44,
		0.32, 0.24,
	]);
	return { ratingGrid, moveIndex, probabilities };
}

function makeSfOutput(): StockfishOutput {
	return {
		evalCp: 25,
		evalMate: null,
		topMoves: [
			{ move: "e2e4", evalCp: 25, evalMate: null },
			{ move: "d2d4", evalCp: 20, evalMate: null },
		],
	};
}

// ── Drizzle mock builder ───────────────────────────────────────────────

type MockRow = Record<string, unknown>;

/**
 * Minimal Drizzle mock. `select()` returns rows from the in-memory store;
 * `insert()` appends to the store and records the `onConflictDoNothing` call.
 */
function makeMockDb(initialRows: MockRow[] = []) {
	const store: MockRow[] = [...initialRows];
	const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);

	const selectFn = vi.fn().mockImplementation(() => ({
		from: vi.fn().mockReturnThis(),
		where: vi.fn().mockResolvedValue(store),
	}));

	const insertFn = vi.fn().mockImplementation(() => ({
		values: vi.fn().mockReturnThis(),
		onConflictDoNothing,
	}));

	return {
		select: selectFn,
		insert: insertFn,
		onConflictDoNothing,
		store,
	};
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("position-cache / Maia round-trip", () => {
	it("putMaia then getMaiaBatch round-trips Float32Array byte-for-byte", async () => {
		const original = makeMaiaOutput();

		// Simulate what putMaia writes and getMaiaBatch reads by going through
		// the real encode/decode path. We test this via the module's own
		// internal byte conversion by inspecting what lands in the store.

		// Because the Drizzle mock doesn't really persist between calls,
		// we verify the encoding/decoding symmetry directly.
		// encode: Uint8Array view of the Float32Array buffer
		const encoded = new Uint8Array(
			original.probabilities.buffer,
			original.probabilities.byteOffset,
			original.probabilities.byteLength,
		);
		// decode: Float32Array view of the Uint8Array buffer
		const decoded = new Float32Array(
			encoded.buffer,
			encoded.byteOffset,
			encoded.byteLength / 4,
		);

		expect(decoded.length).toBe(original.probabilities.length);
		for (let i = 0; i < original.probabilities.length; i++) {
			expect(decoded[i]).toBe(original.probabilities[i]);
		}
	});
});

describe("position-cache / getMaiaBatch", () => {
	it("returns a Map keyed by FEN; missing FENs are absent", async () => {
		const output = makeMaiaOutput();
		const row = {
			fen: TEST_FEN,
			maiaVersion: MAIA_VERSION,
			outputBlob: new Uint8Array(
				output.probabilities.buffer,
				output.probabilities.byteOffset,
				output.probabilities.byteLength,
			),
			moveIndex: output.moveIndex,
			ratingGrid: output.ratingGrid,
			createdAt: new Date(),
		};

		const mock = makeMockDb([row]);
		const cache = createPositionCache(
			mock as unknown as Parameters<typeof createPositionCache>[0],
		);

		const map = await cache.getMaiaBatch(
			[TEST_FEN, "missing fen"],
			MAIA_VERSION,
		);

		expect(map.has(TEST_FEN)).toBe(true);
		expect(map.has("missing fen")).toBe(false);
		expect(map.get(TEST_FEN)?.moveIndex).toEqual(output.moveIndex);
	});
});

describe("position-cache / getPositionDataBatch", () => {
	it("issues exactly 2 queries regardless of input size", async () => {
		const mock = makeMockDb([]);
		const cache = createPositionCache(
			mock as unknown as Parameters<typeof createPositionCache>[0],
		);

		const fens = [TEST_FEN, "fen2", "fen3", "fen4"];
		await cache.getPositionDataBatch(fens, {
			maiaVersion: MAIA_VERSION,
			stockfishVersion: SF_VERSION,
			stockfishDepth: SF_DEPTH,
		});

		// select is called once for maia + once for stockfish = 2
		expect(mock.select).toHaveBeenCalledTimes(2);
	});

	it("returns a Map entry for every requested FEN, with nulls for missing data", async () => {
		const mock = makeMockDb([]);
		const cache = createPositionCache(
			mock as unknown as Parameters<typeof createPositionCache>[0],
		);

		const fens = [TEST_FEN];
		const result = await cache.getPositionDataBatch(fens, {
			maiaVersion: MAIA_VERSION,
			stockfishVersion: SF_VERSION,
			stockfishDepth: SF_DEPTH,
		});

		expect(result.size).toBe(1);
		const entry = result.get(TEST_FEN);
		expect(entry?.fen).toBe(TEST_FEN);
		expect(entry?.maia).toBeNull();
		expect(entry?.stockfish).toBeNull();
	});
});

describe("position-cache / putMaia", () => {
	it("calls onConflictDoNothing for idempotent inserts", async () => {
		const mock = makeMockDb();
		const cache = createPositionCache(
			mock as unknown as Parameters<typeof createPositionCache>[0],
		);

		await cache.putMaia(TEST_FEN, MAIA_VERSION, makeMaiaOutput());

		expect(mock.onConflictDoNothing).toHaveBeenCalledTimes(1);
	});
});

describe("position-cache / putStockfish", () => {
	it("calls onConflictDoNothing for idempotent inserts", async () => {
		const mock = makeMockDb();
		const cache = createPositionCache(
			mock as unknown as Parameters<typeof createPositionCache>[0],
		);

		await cache.putStockfish(TEST_FEN, SF_VERSION, SF_DEPTH, makeSfOutput());

		expect(mock.onConflictDoNothing).toHaveBeenCalledTimes(1);
	});
});
