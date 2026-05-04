/**
 * One-shot: populate `moves.clock_remaining_ms` for already-analyzed games.
 *
 * Re-parses each game's PGN with `extractClockMsByPly` and updates the
 * existing `moves` rows in place. Idempotent — re-running just rewrites
 * the same values. Skips games whose PGN has no [%clk] annotations.
 *
 * DELETE THIS FILE after a successful run; new analysis runs populate the
 * column directly via the analyze-game worker.
 *
 * Run with: bun scripts/backfill-clock-times.ts
 */
import { config } from "dotenv";
import { eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { games, moves } from "#/db/schema";
import { extractClockMsByPly } from "#/lib/analysis/pgn";

config({ path: ".env.local" });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL is not set");
	process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);

const gamesToBackfill = await db
	.selectDistinct({ id: games.id, pgn: games.pgn })
	.from(games)
	.innerJoin(moves, eq(moves.gameId, games.id))
	.where(isNull(moves.clockRemainingMs));

console.log(`Found ${gamesToBackfill.length} games with missing clock data`);

let updated = 0;
let skipped = 0;

for (const game of gamesToBackfill) {
	const plyCounts = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(moves)
		.where(eq(moves.gameId, game.id));
	const expectedPlies = plyCounts[0]?.count ?? 0;
	if (expectedPlies === 0) {
		skipped++;
		continue;
	}

	const clockMs = extractClockMsByPly(game.pgn, expectedPlies);
	if (clockMs.every((v) => v === null)) {
		skipped++;
		continue;
	}

	for (let i = 0; i < clockMs.length; i++) {
		const ms = clockMs[i];
		if (ms === null) continue;
		await db
			.update(moves)
			.set({ clockRemainingMs: ms })
			.where(sql`${moves.gameId} = ${game.id} AND ${moves.ply} = ${i + 1}`);
	}
	updated++;
	if (updated % 50 === 0) console.log(`  updated ${updated}…`);
}

console.log(`Done. Updated: ${updated}, skipped (no clk): ${skipped}`);
await pool.end();
