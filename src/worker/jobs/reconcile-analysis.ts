/**
 * reconcile-analysis worker job.
 *
 * Safety net cron that recovers games which fell through the normal enqueue
 * path. Two recovery criteria:
 *
 *  1. **Orphans** — `games` rows with no matching `analysis_jobs` row.
 *     Caused when every pg-boss attempt of `analyze-game` failed before
 *     `claimOrCreateJob` could insert a row (e.g. the schema-mismatch
 *     incident on game 0d9c58c1).
 *
 *  2. **Maia stragglers** — `analysis_jobs` rows where Stockfish completed
 *     but `maia_predicted_white IS NULL`. Caused when `analyze-game-maia`
 *     silently swallowed an exception (the pre-fix Promise.allSettled bug)
 *     and pg-boss marked the job `completed` without persisting data.
 *
 * Each recovery dispatches via the appropriate `enqueue*` helper —
 * singleton keys + worker-side idempotency (`claimOrCreateJob`,
 * `isAlreadyPersisted`) make this safe to run concurrently with normal
 * sync/analysis activity.
 *
 * Failed `analysis_jobs.status='failed'` rows are intentionally NOT
 * auto-retried — that path has a UI affordance via `resetAndTriggerAnalysis`,
 * and silent retry could mask real bugs (invalid PGN, etc.). To extend
 * coverage further (e.g. stuck `running` rows), add another query and
 * dispatch case to the lists below — the handler structure stays the same.
 */
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgBoss } from "pg-boss";
import type * as schema from "#/db/schema";
import {
	createAndEnqueueAnalysis,
	enqueueMaiaOnly,
} from "#/lib/enqueue-analysis";
import { getWorkerDb } from "#/worker/db";

type Db = NodePgDatabase<typeof schema>;

export const RECONCILE_ANALYSIS_QUEUE = "reconcile-analysis";

export type MaiaStraggler = { gameId: string; analysisJobId: string };

export type ReconcileTargets = {
	orphanGameIds: string[];
	maiaStragglers: MaiaStraggler[];
};

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
		const targets = await findReconcileTargets(db);
		await reEnqueueOrphans(db, targets.orphanGameIds);
		await reEnqueueMaiaStragglers(targets.maiaStragglers);
		logSummary(targets);
	} catch (err) {
		console.error("[reconcile-analysis] failed:", err);
		throw err;
	}
}

export async function findReconcileTargets(db: Db): Promise<ReconcileTargets> {
	const [orphanGameIds, maiaStragglers] = await Promise.all([
		findOrphanGameIds(db),
		findMaiaStragglers(db),
	]);
	return { orphanGameIds, maiaStragglers };
}

/** Games with no `analysis_jobs` row at all. */
async function findOrphanGameIds(db: Db): Promise<string[]> {
	const rows = await db.execute<{ id: string }>(sql`
		SELECT g.id::text AS id
		FROM games g
		LEFT JOIN analysis_jobs aj ON aj.game_id = g.id
		WHERE aj.id IS NULL
	`);
	return rows.rows.map((r) => r.id);
}

/**
 * `analysis_jobs` rows where Stockfish is complete but Maia data was never
 * persisted. Bounded by `completed_at` so we only catch truly stuck rows,
 * not ones whose maia job is normally queued/in-flight (Maia typically
 * finishes within seconds of Stockfish; 10 minutes is well past that).
 */
const MAIA_STRAGGLER_GRACE_MINUTES = 10;

async function findMaiaStragglers(db: Db): Promise<MaiaStraggler[]> {
	const rows = await db.execute<{
		game_id: string;
		analysis_job_id: string;
	}>(sql`
		SELECT aj.game_id::text AS game_id, aj.id::text AS analysis_job_id
		FROM analysis_jobs aj
		WHERE aj.status = 'complete'
		  AND aj.maia_predicted_white IS NULL
		  AND aj.maia_predicted_black IS NULL
		  AND aj.completed_at < NOW() - (${MAIA_STRAGGLER_GRACE_MINUTES}::int * INTERVAL '1 minute')
	`);
	return rows.rows.map((r) => ({
		gameId: r.game_id,
		analysisJobId: r.analysis_job_id,
	}));
}

async function reEnqueueOrphans(db: Db, gameIds: string[]): Promise<void> {
	for (const id of gameIds) {
		await createAndEnqueueAnalysis(db, id);
	}
}

async function reEnqueueMaiaStragglers(
	stragglers: MaiaStraggler[],
): Promise<void> {
	for (const s of stragglers) {
		await enqueueMaiaOnly(s.gameId, s.analysisJobId);
	}
}

function logSummary(targets: ReconcileTargets): void {
	const { orphanGameIds, maiaStragglers } = targets;
	if (orphanGameIds.length === 0 && maiaStragglers.length === 0) {
		console.log("[reconcile-analysis] nothing to reconcile");
		return;
	}
	console.log(
		`[reconcile-analysis] re-enqueued ${orphanGameIds.length} orphan(s), ${maiaStragglers.length} maia straggler(s)`,
	);
}
