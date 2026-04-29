/**
 * Reusable Stockfish engine pool.
 *
 * Engines are initialised once and reused across many jobs. The pool uses a
 * simple async-semaphore queue: callers block in `run()` until a slot is free.
 *
 * Error recovery: if a job's callback throws, the failed engine is destroyed
 * and replaced with a freshly-initialised one so the pool stays at full size.
 */
import type { AnalysisEngine } from "#/providers/analysis-engine";
import { createStockfishWasmEngine } from "#/providers/stockfish-wasm-engine";

export type StockfishPool = {
	/** Acquire an engine, run fn, release it. Returns fn's result. */
	run<T>(fn: (engine: AnalysisEngine) => Promise<T>): Promise<T>;
	/** Wait for in-flight runs to finish, then destroy all engines. */
	destroyAll(): Promise<void>;
	/** Number of engines in the pool (including busy ones). */
	size(): number;
};

type PoolOptions = {
	size: number;
	multipv: number;
};

type Waiter = (engine: AnalysisEngine) => void;

async function makeEngine(multipv: number): Promise<AnalysisEngine> {
	const engine = createStockfishWasmEngine({ multipv });
	await engine.init();
	return engine;
}

export function createStockfishPool(opts: PoolOptions): StockfishPool {
	const { size, multipv } = opts;

	const idle: AnalysisEngine[] = [];
	const waiters: Waiter[] = [];
	let poolSize = 0;
	let initPromise: Promise<void> | null = null;

	function init(): Promise<void> {
		if (initPromise !== null) return initPromise;
		initPromise = (async () => {
			const engines = await Promise.all(
				Array.from({ length: size }, () => makeEngine(multipv)),
			);
			for (const engine of engines) {
				idle.push(engine);
				poolSize++;
			}
		})();
		return initPromise;
	}

	function acquire(): Promise<AnalysisEngine> {
		const engine = idle.pop();
		if (engine !== undefined) {
			return Promise.resolve(engine);
		}
		return new Promise<AnalysisEngine>((resolve) => {
			waiters.push(resolve);
		});
	}

	function release(engine: AnalysisEngine): void {
		const waiter = waiters.shift();
		if (waiter) {
			waiter(engine);
		} else {
			idle.push(engine);
		}
	}

	async function replaceEngine(): Promise<AnalysisEngine> {
		return makeEngine(multipv);
	}

	async function run<T>(
		fn: (engine: AnalysisEngine) => Promise<T>,
	): Promise<T> {
		await init();
		const engine = await acquire();
		try {
			const result = await fn(engine);
			release(engine);
			return result;
		} catch (err) {
			// Drop the failed engine, spin up a replacement
			try {
				await engine.destroy();
			} catch {
				// ignore destroy errors
			}
			const replacement = await replaceEngine();
			release(replacement);
			throw err;
		}
	}

	async function destroyAll(): Promise<void> {
		// Wait for all busy engines to return to the idle list
		while (idle.length < poolSize) {
			await new Promise<void>((resolve) => {
				waiters.push((engine) => {
					idle.push(engine);
					resolve();
				});
			});
		}
		await Promise.all(idle.map((e) => e.destroy()));
		idle.length = 0;
		poolSize = 0;
	}

	return { run, destroyAll, size: () => poolSize };
}
