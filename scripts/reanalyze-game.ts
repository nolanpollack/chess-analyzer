/**
 * Wipes and re-enqueues a single game for analysis.
 * Run with: bun run reanalyze-game <game-id>
 */
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "#/db/schema";
import { analysisJobs, moveExplanations, moves, moveTags } from "#/db/schema";
import { createAndEnqueueAnalysis } from "#/lib/enqueue-analysis";
import { getBoss } from "#/lib/queue";
import { ANALYZE_GAME_QUEUE } from "#/worker/jobs/analyze-game";
import { ANALYZE_GAME_MAIA_QUEUE } from "#/worker/jobs/analyze-game-maia";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL is not set");
	process.exit(1);
}

const gameId = process.argv[2];
if (!gameId) {
	console.error("Usage: bun run reanalyze-game <game-id>");
	process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool, { schema });

console.log(`Wiping analysis data for game ${gameId}...`);

const moveIds = await db
	.select({ id: moves.id })
	.from(moves)
	.where(eq(moves.gameId, gameId));

if (moveIds.length > 0) {
	const ids = moveIds.map((m) => m.id);
	await db.delete(moveExplanations).where(inArray(moveExplanations.moveId, ids));
	await db.delete(moveTags).where(inArray(moveTags.moveId, ids));
	await db.delete(moves).where(inArray(moves.id, ids));
}

await db.delete(analysisJobs).where(eq(analysisJobs.gameId, gameId));

const boss = await getBoss();
await boss.createQueue(ANALYZE_GAME_QUEUE);
await boss.createQueue(ANALYZE_GAME_MAIA_QUEUE);

await createAndEnqueueAnalysis(db, gameId);
console.log(`Game ${gameId} enqueued for re-analysis (Stockfish + Maia).`);

await boss.stop();
await pool.end();
