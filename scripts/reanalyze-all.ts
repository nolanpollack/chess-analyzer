/**
 * Resets all game analyses to pending and re-enqueues them for processing.
 * Run with: bun run reanalyze
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { PgBoss } from "pg-boss";
import pg from "pg";
import { gameAnalyses, games } from "#/db/schema";
import { ANALYZE_GAME_QUEUE } from "#/worker/jobs/analyze-game";

config({ path: ".env.local" });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL is not set");
	process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);

console.log("Resetting all game analyses to pending...");
await db.update(gameAnalyses).set({
	status: "pending",
	moves: [],
	accuracyWhite: null,
	accuracyBlack: null,
	movesAnalyzed: 0,
	totalMoves: null,
	errorMessage: null,
	analyzedAt: null,
});

const allGames = await db.select({ id: games.id }).from(games);
console.log(`Enqueueing ${allGames.length} games for re-analysis...`);

const boss = new PgBoss(DATABASE_URL);
await boss.start();
await boss.createQueue(ANALYZE_GAME_QUEUE);

for (const game of allGames) {
	await boss.send(ANALYZE_GAME_QUEUE, { gameId: game.id });
}

await boss.stop();
await pool.end();

console.log(`Done. ${allGames.length} games queued.`);
