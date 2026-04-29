import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisEngine } from "#/providers/analysis-engine";

// vi.mock is hoisted — cannot reference module-level variables inside the factory.
// Import the mock after vi.mock so we can set its implementation per-test.
vi.mock("#/providers/stockfish-wasm-engine", () => ({
	createStockfishWasmEngine: vi.fn(),
}));

import { createStockfishWasmEngine } from "#/providers/stockfish-wasm-engine";
import { createStockfishPool } from "./stockfish-pool";

const makeEngineMock = vi.mocked(createStockfishWasmEngine);

function makeFakeEngine(id = 0): AnalysisEngine & { id: number } {
	return {
		id,
		init: vi.fn().mockResolvedValue(undefined),
		analyzePosition: vi.fn().mockResolvedValue({ pvs: [] }),
		destroy: vi.fn().mockResolvedValue(undefined),
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("createStockfishPool", () => {
	it("serialises runs when pool size is 1", async () => {
		const engine = makeFakeEngine();
		makeEngineMock.mockReturnValue(engine);

		const pool = createStockfishPool({ size: 1, multipv: 2 });

		const order: number[] = [];

		// Start first run — blocks until we call resolve1
		let resolve1!: () => void;
		const p1 = pool.run(
			() =>
				new Promise<void>((res) => {
					order.push(1);
					resolve1 = res;
				}),
		);

		// Let the pool initialise and p1's fn start
		await vi.waitUntil(() => resolve1 !== undefined);

		// Second run should not start until first finishes
		let started2 = false;
		const p2 = pool.run(() => {
			started2 = true;
			order.push(2);
			return Promise.resolve();
		});

		// p2 has not started yet
		expect(started2).toBe(false);

		resolve1();
		await p1;
		await p2;

		expect(order).toEqual([1, 2]);
	});

	it("parallelises up to pool size", async () => {
		const engines = [makeFakeEngine(0), makeFakeEngine(1)];
		let callCount = 0;
		makeEngineMock.mockImplementation(() => engines[callCount++]);

		const pool = createStockfishPool({ size: 2, multipv: 2 });

		let concurrent = 0;
		let maxConcurrent = 0;
		const resolvers: Array<() => void> = [];

		// Start both jobs — the pool has 2 slots so both should acquire immediately
		const p1 = pool.run(
			() =>
				new Promise<void>((res) => {
					concurrent++;
					maxConcurrent = Math.max(maxConcurrent, concurrent);
					resolvers.push(() => {
						concurrent--;
						res();
					});
				}),
		);
		const p2 = pool.run(
			() =>
				new Promise<void>((res) => {
					concurrent++;
					maxConcurrent = Math.max(maxConcurrent, concurrent);
					resolvers.push(() => {
						concurrent--;
						res();
					});
				}),
		);

		// Wait for both callbacks to register (proves both are running concurrently)
		await vi.waitUntil(() => resolvers.length === 2, { timeout: 5000 });

		expect(maxConcurrent).toBe(2);

		for (const r of resolvers) r();
		await Promise.all([p1, p2]);
	});

	it("rejects run on engine error and subsequent run succeeds (pool replaces engine)", async () => {
		const bad = makeFakeEngine(0);
		const good = makeFakeEngine(1);
		let callCount = 0;
		makeEngineMock.mockImplementation(() => (callCount++ === 0 ? bad : good));

		const pool = createStockfishPool({ size: 1, multipv: 2 });

		// First run throws
		await expect(
			pool.run(() => Promise.reject(new Error("engine exploded"))),
		).rejects.toThrow("engine exploded");

		expect(bad.destroy).toHaveBeenCalledOnce();

		// Second run should succeed using replacement engine
		const result = await pool.run(() => Promise.resolve(42));
		expect(result).toBe(42);
	});

	it("destroyAll waits for in-flight run then destroys engines", async () => {
		const engine = makeFakeEngine();
		makeEngineMock.mockReturnValue(engine);

		const pool = createStockfishPool({ size: 1, multipv: 2 });

		// Start an in-flight run
		let resolveInFlight!: () => void;
		const inFlight = pool.run(
			() =>
				new Promise<void>((res) => {
					resolveInFlight = res;
				}),
		);

		// Wait for the run to start
		await vi.waitUntil(() => resolveInFlight !== undefined);

		let destroyed = false;
		const destroyPromise = pool.destroyAll().then(() => {
			destroyed = true;
		});

		// destroy should not complete while in-flight
		await Promise.resolve();
		await Promise.resolve();
		expect(destroyed).toBe(false);

		// Finish the in-flight run
		resolveInFlight();
		await inFlight;
		await destroyPromise;

		expect(destroyed).toBe(true);
		expect(engine.destroy).toHaveBeenCalledOnce();
	});
});
