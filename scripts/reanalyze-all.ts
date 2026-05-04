/**
 * Wipes all analysis state and re-enqueues every game for analysis.
 * Run with: bun run reanalyze
 */
import { desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
	analysisJobs,
	games,
	moveExplanations,
	moves,
	moveTags,
} from "#/db/schema";
import { enqueueGameAnalysis } from "#/lib/enqueue-analysis";
import { getBoss } from "#/lib/queue";
import { ANALYZE_GAME_QUEUE } from "#/worker/jobs/analyze-game";
import { ANALYZE_GAME_MAIA_QUEUE } from "#/worker/jobs/analyze-game-maia";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL is not set");
	process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);

console.log("Wiping analysis tables...");
await db.delete(moveExplanations);
await db.delete(moveTags);
await db.delete(moves);
await db.delete(analysisJobs);

const boss = await getBoss();
await boss.createQueue(ANALYZE_GAME_QUEUE);
await boss.deleteAllJobs(ANALYZE_GAME_QUEUE);
await boss.createQueue(ANALYZE_GAME_MAIA_QUEUE);
await boss.deleteAllJobs(ANALYZE_GAME_MAIA_QUEUE);
console.log("Cleared stale jobs from queues.");

const allGames = await db
	.select({ id: games.id })
	.from(games)
	.orderBy(desc(games.playedAt));
console.log(
	`Enqueueing ${allGames.length} games for re-analysis (newest first)...`,
);

for (const game of allGames) {
	await enqueueGameAnalysis(game.id);
}

await boss.stop();
await pool.end();

console.log(`Done. ${allGames.length} games queued.`);
