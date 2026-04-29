/**
 * Enqueues analyze-game-maia for every analysis_jobs row that is missing
 * Maia rating data (maiaPredictedWhite IS NULL).
 *
 * Run with: bun run backfill-maia
 *
 * Idempotent: computeAndPersistMaiaRating checks for existing data before
 * writing; the singletonKey prevents duplicate pg-boss job rows.
 */
import { config } from "dotenv";
import { isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { PgBoss } from "pg-boss";
import pg from "pg";
import { analysisJobs } from "#/db/schema";
import {
	ANALYZE_GAME_MAIA_QUEUE,
	type AnalyzeGameMaiaPayload,
} from "#/worker/jobs/analyze-game-maia";

config({ path: ".env.local" });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL is not set");
	process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);

const rows = await db
	.select({ id: analysisJobs.id, gameId: analysisJobs.gameId })
	.from(analysisJobs)
	.where(isNull(analysisJobs.maiaPredictedWhite));

console.log(
	`Enqueueing Maia for ${rows.length} analysis jobs missing Maia data...`,
);

const boss = new PgBoss(DATABASE_URL);
await boss.start();
await boss.createQueue(ANALYZE_GAME_MAIA_QUEUE);

for (const row of rows) {
	await boss.send(
		ANALYZE_GAME_MAIA_QUEUE,
		{ gameId: row.gameId, analysisJobId: row.id } satisfies AnalyzeGameMaiaPayload,
		{
			singletonKey: `analyze-game-maia:${row.id}`,
			retryLimit: 3,
			retryBackoff: true,
		},
	);
}

await boss.stop();
await pool.end();

console.log(`Done. ${rows.length} Maia jobs enqueued.`);
