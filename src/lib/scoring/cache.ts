import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { dimensionScoreCache } from "#/db/schema";

/**
 * Player-scoped invalidation of `dimension_score_cache`. Called by the worker
 * after a successful analyze-game run, and by tests / manual recompute paths.
 *
 * Lives in `src/lib/scoring/` (not `features/ratings/server/`) so the worker —
 * which cannot import server functions — can call it directly with its own
 * Drizzle instance.
 */
export async function invalidatePlayerCache(
	// biome-ignore lint/suspicious/noExplicitAny: schema-agnostic Drizzle instance
	db: NodePgDatabase<any>,
	playerId: string,
): Promise<void> {
	await db
		.delete(dimensionScoreCache)
		.where(eq(dimensionScoreCache.playerId, playerId));
}
