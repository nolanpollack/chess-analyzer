/**
 * Backfill Maia cache for already-analyzed games.
 *
 * For each move whose (fen_before, MAIA_VERSION) is NOT yet in maia_cache,
 * this script dedupes the FENs and enqueues Maia analysis batches via
 * ensureAnalyzed (skipStockfish=true). The worker must be running to drain
 * the queue.
 *
 * Usage:
 *   bun scripts/backfill-maia-cache.ts [--batch 500]
 *
 * Idempotent: re-running dedupes against current cache contents.
 */
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "#/db/schema";
import { ensureAnalyzed } from "#/lib/analysis-dispatcher";
import { createPositionCache } from "#/lib/position-cache";
import { PRODUCTION_MAIA_VERSIONS } from "#/lib/scoring/maia-game-rating";

config({ path: ".env.local" });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
	console.error("DATABASE_URL is not set");
	process.exit(1);
}

// ── CLI args ──────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
function argValue(flag: string): string | undefined {
	const idx = argv.indexOf(flag);
	return idx !== -1 ? argv[idx + 1] : undefined;
}
const BATCH_SIZE = Number(argValue("--batch") ?? "500");

// ── DB setup ──────────────────────────────────────────────────────────────────

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool, { schema });
const cache = createPositionCache(db);

// ── Find uncached FENs ────────────────────────────────────────────────────────

console.log("[backfill] Querying uncached FENs...");

const uncachedFens: string[] = await (async () => {
	// Get all distinct fen_before values from moves that are NOT in maia_cache
	// for the production maia version. A left join + null-check is the
	// efficient approach.
	const rows = await db.execute(sql`
		SELECT DISTINCT m.fen_before AS fen
		FROM moves m
		LEFT JOIN maia_cache mc
			ON mc.fen = m.fen_before
			AND mc.maia_version = ${PRODUCTION_MAIA_VERSIONS.maiaVersion}
		WHERE mc.fen IS NULL
	`);
	return (rows.rows as { fen: string }[]).map((r) => r.fen);
})();

console.log(`[backfill] Found ${uncachedFens.length} uncached FENs`);

if (uncachedFens.length === 0) {
	console.log("[backfill] Nothing to do.");
	await pool.end();
	process.exit(0);
}

// ── Batch and enqueue ─────────────────────────────────────────────────────────

let processed = 0;
const total = uncachedFens.length;

for (let i = 0; i < total; i += BATCH_SIZE) {
	const batch = uncachedFens.slice(i, i + BATCH_SIZE);
	await ensureAnalyzed(batch, PRODUCTION_MAIA_VERSIONS, cache, {
		wait: true,
		skipStockfish: true,
	});
	processed += batch.length;
	console.log(`[backfill] ${processed} / ${total} FENs cached`);
}

console.log("[backfill] Done.");
await pool.end();
