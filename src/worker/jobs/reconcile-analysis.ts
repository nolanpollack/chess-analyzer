/**
 * reconcile-analysis worker job.
 *
 * Safety net cron that recovers games which fell through the normal enqueue
 * path. Currently scoped to `orphaned` games (rows in `games` with no
 * matching `analysis_jobs` row), which is the failure mode that lost the
 * 0d9c58c1 game in April 2026 — the analyze-game handler crashed on every
 * pg-boss attempt before the analysis_jobs row could be inserted.
 *
 * The handler re-enqueues each orphan via `enqueueGameAnalysis`, which sets
 * `singletonKey` so a race against an in-flight sync-games does not double
 * enqueue. The worker's `claimOrCreateJob` is the second line of defence.
 *
 * Failed jobs are intentionally NOT auto-retried here — that path has a UI
 * affordance via `resetAndTriggerAnalysis`, and silently retrying could
 * mask real bugs (e.g. invalid PGN). To extend coverage to stuck `running`
 * rows or other criteria, add another query and union into
 * `findGameIdsNeedingReconcile`.
 */
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgBoss } from "pg-boss";
import type * as schema from "#/db/schema";
import { enqueueGameAnalysis } from "#/lib/enqueue-analysis";
import { getWorkerDb } from "#/worker/db";

type Db = NodePgDatabase<typeof schema>;

export const RECONCILE_ANALYSIS_QUEUE = "reconcile-analysis";

export function registerReconcileAnalysisJob(boss: PgBoss) {
	boss.work(
		RECONCILE_ANALYSIS_QUEUE,
		{ pollingIntervalSeconds: 60, batchSize: 1 },
		async (jobs) => {
			for (const _job of jobs) {
				await handleReconcile();
			}
		},
	);
}

async function handleReconcile(): Promise<void> {
	const db = getWorkerDb();
	try {
		const orphanIds = await findGameIdsNeedingReconcile(db);
		if (orphanIds.length === 0) {
			console.log("[reconcile-analysis] no orphans");
			return;
		}
		await reEnqueueAll(orphanIds);
		console.log(
			`[reconcile-analysis] re-enqueued ${orphanIds.length} orphan game(s)`,
		);
	} catch (err) {
		console.error("[reconcile-analysis] failed:", err);
		throw err;
	}
}

/**
 * Returns game IDs that the normal enqueue path lost track of.
 * Currently: games with no `analysis_jobs` row at all.
 */
export async function findGameIdsNeedingReconcile(db: Db): Promise<string[]> {
	const rows = await db.execute<{ id: string }>(sql`
		SELECT g.id::text AS id
		FROM games g
		LEFT JOIN analysis_jobs aj ON aj.game_id = g.id
		WHERE aj.id IS NULL
	`);
	return rows.rows.map((r) => r.id);
}

async function reEnqueueAll(gameIds: string[]): Promise<void> {
	for (const id of gameIds) {
		await enqueueGameAnalysis(id);
	}
}
