/**
 * On-demand version of the reconcile-analysis cron.
 *
 *   bun run reconcile             → print + enqueue
 *   bun run reconcile -- --dry-run → print only, no enqueue
 *
 * Reuses the same finder used by the worker cron so behaviour stays in
 * lockstep. Enqueues via the standard helpers (singleton-keyed, retry-armed).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
	enqueueGameAnalysis,
	enqueueMaiaOnly,
} from "#/lib/enqueue-analysis";
import { getBoss } from "#/lib/queue";
import { findReconcileTargets } from "#/worker/jobs/reconcile-analysis";

const dryRun = process.argv.includes("--dry-run");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL is not set");
	process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);

const targets = await findReconcileTargets(db);
const { orphanGameIds, maiaStragglers } = targets;

console.log(`Orphans (no analysis_jobs row):     ${orphanGameIds.length}`);
console.log(`Maia stragglers (sf done, maia null): ${maiaStragglers.length}`);

if (orphanGameIds.length === 0 && maiaStragglers.length === 0) {
	console.log("Nothing to reconcile.");
	await pool.end();
	process.exit(0);
}

if (dryRun) {
	console.log("\n--dry-run: no jobs enqueued");
	await pool.end();
	process.exit(0);
}

console.log("\nEnqueueing...");
for (const id of orphanGameIds) {
	await enqueueGameAnalysis(id);
}
for (const s of maiaStragglers) {
	await enqueueMaiaOnly(s.gameId, s.analysisJobId);
}

const boss = await getBoss();
await boss.stop();
await pool.end();

console.log(
	`Done. Enqueued ${orphanGameIds.length} analyze-game + ${maiaStragglers.length} analyze-game-maia.`,
);
