import { describe, expect, it, vi } from "vitest";
import { inferMaia, inferMaiaBatch } from "./index";

const VALID_RESPONSE = {
	maiaVersion: "maia2",
	ratingGrid: [1100, 1200],
	moveIndex: ["e2e4", "d2d4", "g1f3"],
	probabilities: [
		[0.5, 0.3, 0.2],
		[0.4, 0.4, 0.2],
	],
};

function mockFetch(body: unknown, status = 200) {
	globalThis.fetch = vi.fn().mockResolvedValueOnce({
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(body),
	} as unknown as Response);
}

describe("inferMaia", () => {
	it("success path returns parsed body", async () => {
		mockFetch(VALID_RESPONSE);

		const result = await inferMaia(
			"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
			{
				baseUrl: "http://localhost:8765",
			},
		);

		expect(result.maiaVersion).toBe("maia2");
		expect(result.ratingGrid).toEqual([1100, 1200]);
		expect(result.moveIndex).toEqual(["e2e4", "d2d4", "g1f3"]);
		expect(result.probabilities).toEqual(VALID_RESPONSE.probabilities);
	});

	it("400 with error body throws with the error message", async () => {
		mockFetch({ error: "invalid FEN string" }, 400);

		await expect(
			inferMaia("bad-fen", { baseUrl: "http://localhost:8765" }),
		).rejects.toThrow("invalid FEN string");
	});

	it("non-JSON 500 throws with status code", async () => {
		globalThis.fetch = vi.fn().mockResolvedValueOnce({
			ok: false,
			status: 500,
			json: () => Promise.reject(new SyntaxError("Unexpected token")),
		} as unknown as Response);

		await expect(
			inferMaia("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", {
				baseUrl: "http://localhost:8765",
			}),
		).rejects.toThrow("Maia service returned 500");
	});

	it("timeout: throws when server does not respond within budget", async () => {
		globalThis.fetch = vi.fn().mockImplementationOnce(
			(_url: string, opts: RequestInit) =>
				new Promise((_resolve, reject) => {
					const signal = opts?.signal as AbortSignal | undefined;
					if (signal) {
						signal.addEventListener("abort", () => {
							const err = new Error("AbortError");
							err.name = "AbortError";
							reject(err);
						});
					}
				}),
		);

		await expect(
			inferMaia("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", {
				baseUrl: "http://localhost:8765",
				timeoutMs: 5,
			}),
		).rejects.toThrow(/timed out/);
	}, 2000);

	it("bad shape (probabilities not array) throws", async () => {
		mockFetch({
			maiaVersion: "maia2",
			ratingGrid: [1100],
			moveIndex: ["e2e4"],
			probabilities: "not-an-array",
		});

		await expect(
			inferMaia("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", {
				baseUrl: "http://localhost:8765",
			}),
		).rejects.toThrow(/probabilities is not an array/);
	});
});

const VALID_BATCH_RESPONSE = {
	maiaVersion: "maia2-rapid-v1.0",
	ratingGrid: [1100, 1200],
	results: [
		{
			fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
			moveIndex: ["e2e4", "d2d4"],
			probabilities: [
				[0.6, 0.4],
				[0.5, 0.5],
			],
		},
		{
			fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
			moveIndex: ["e7e5", "c7c5"],
			probabilities: [
				[0.7, 0.3],
				[0.6, 0.4],
			],
		},
		{
			fen: "8/8/4k3/8/4PK2/8/8/4R3 w - - 0 1",
			moveIndex: ["e1e6", "f4e3"],
			probabilities: [
				[0.55, 0.45],
				[0.52, 0.48],
			],
		},
	],
};

describe("inferMaiaBatch", () => {
	it("happy path with 3 FENs validates result alignment", async () => {
		mockFetch(VALID_BATCH_RESPONSE);

		const fens = VALID_BATCH_RESPONSE.results.map((r) => r.fen);
		const result = await inferMaiaBatch(fens, {
			baseUrl: "http://localhost:8765",
		});

		expect(result.maiaVersion).toBe("maia2-rapid-v1.0");
		expect(result.ratingGrid).toEqual([1100, 1200]);
		expect(result.results).toHaveLength(3);
		for (let i = 0; i < fens.length; i++) {
			expect(result.results[i].fen).toBe(fens[i]);
			expect(result.results[i].moveIndex).toEqual(
				VALID_BATCH_RESPONSE.results[i].moveIndex,
			);
			expect(result.results[i].probabilities).toEqual(
				VALID_BATCH_RESPONSE.results[i].probabilities,
			);
		}
	});

	it("bad shape (missing results) throws", async () => {
		mockFetch({
			maiaVersion: "maia2-rapid-v1.0",
			ratingGrid: [1100, 1200],
			// missing results field
		});

		await expect(
			inferMaiaBatch(
				["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"],
				{ baseUrl: "http://localhost:8765" },
			),
		).rejects.toThrow(/results is not an array/);
	});

	it("timeout works", async () => {
		globalThis.fetch = vi.fn().mockImplementationOnce(
			(_url: string, opts: RequestInit) =>
				new Promise((_resolve, reject) => {
					const signal = opts?.signal as AbortSignal | undefined;
					if (signal) {
						signal.addEventListener("abort", () => {
							const err = new Error("AbortError");
							err.name = "AbortError";
							reject(err);
						});
					}
				}),
		);

		await expect(
			inferMaiaBatch(
				["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"],
				{
					baseUrl: "http://localhost:8765",
					timeoutMs: 5,
				},
			),
		).rejects.toThrow(/timed out/);
	}, 2000);

	it("400 with error body throws with the error message", async () => {
		mockFetch({ error: "fens list must not be empty" }, 400);

		await expect(
			inferMaiaBatch([], { baseUrl: "http://localhost:8765" }),
		).rejects.toThrow("fens list must not be empty");
	});
});
