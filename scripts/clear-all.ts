/**
 * Wipes all game data and resets player sync timestamps for a fresh resync.
 * Run with: bun run clear-all
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import {
	analysisJobs,
	dimensionScoreCache,
	games,
	moveExplanations,
	moves,
	moveTags,
	players,
} from "#/db/schema";

config({ path: ".env.local" });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL is not set");
	process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);

console.log("Clearing all game data...");

await db.delete(moveExplanations);
console.log("  ✓ move_explanations");

await db.delete(moveTags);
console.log("  ✓ move_tags");

await db.delete(dimensionScoreCache);
console.log("  ✓ dimension_score_cache");

await db.delete(moves);
console.log("  ✓ moves");

await db.delete(analysisJobs);
console.log("  ✓ analysis_jobs");

await db.delete(games);
console.log("  ✓ games");

await db.update(players).set({ lastSyncedAt: null });
console.log("  ✓ players.last_synced_at reset to null");

await pool.end();
console.log("Done. Trigger a sync to re-fetch and re-analyze all games.");
