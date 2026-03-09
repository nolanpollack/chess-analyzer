import { PgBoss } from "pg-boss";
import { env } from "#/env";

/**
 * Shared PgBoss instance for enqueuing jobs from server functions.
 * Only used for `send()` / `createQueue()` / `findJobs()` — the worker
 * process has its own separate instance that calls `work()`.
 *
 * pg-boss v12 requires `start()` before any DB operation, so we call it
 * lazily on first use and cache the promise.
 */
let _boss: PgBoss | null = null;
let _startPromise: Promise<PgBoss> | null = null;

export async function getBoss(): Promise<PgBoss> {
	if (!_boss) {
		_boss = new PgBoss(env.DATABASE_URL);
		_boss.on("error", (err: Error) =>
			console.error("[pg-boss server error]", err),
		);
	}

	if (!_startPromise) {
		_startPromise = _boss.start().then(() => _boss as PgBoss);
	}

	await _startPromise;
	return _boss;
}

/**
 * Ensure a queue exists before sending jobs to it.
 * pg-boss v12 requires explicit queue creation; `createQueue` is
 * idempotent (no-ops if the queue already exists).
 */
const _createdQueues = new Set<string>();

export async function ensureQueue(name: string): Promise<void> {
	if (_createdQueues.has(name)) return;
	const boss = await getBoss();
	await boss.createQueue(name);
	_createdQueues.add(name);
}
