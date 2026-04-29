/**
 * Worker-side glue: enqueues Maia analysis jobs for all positions in a game,
 * polls until they are satisfied, then estimates per-side ratings and persists
 * them to analysis_jobs.
 *
 * Idempotent: if maiaPredictedWhite is already set, the function returns early.
 * Re-throws on failure so pg-boss can retry the parent analyze-game job.
 */
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "#/db/schema";
import { analysisJobs } from "#/db/schema";
import { ensureAnalyzed } from "#/lib/analysis-dispatcher";
import type { PositionCache } from "#/lib/position-cache";
import {
	estimateGameSideRating,
	PRODUCTION_MAIA_VERSIONS,
} from "#/lib/scoring/maia-game-rating";

type Db = NodePgDatabase<typeof schema>;

export type ComputeAndPersistMaiaRatingOpts = {
	db: Db;
	cache: PositionCache;
	analysisJobId: string;
	whitePositions: { fen: string; playedMove: string }[];
	blackPositions: { fen: string; playedMove: string }[];
};

/**
 * Checks whether Maia results are already stored for this job.
 * Returns true when work is already done (idempotent skip path).
 */
async function isAlreadyPersisted(
	db: Db,
	analysisJobId: string,
): Promise<boolean> {
	const rows = await db
		.select({ maiaPredictedWhite: analysisJobs.maiaPredictedWhite })
		.from(analysisJobs)
		.where(eq(analysisJobs.id, analysisJobId))
		.limit(1);

	return rows.length > 0 && rows[0].maiaPredictedWhite !== null;
}

function collectUniqueFens(
	whitePositions: { fen: string }[],
	blackPositions: { fen: string }[],
): string[] {
	const seen = new Set<string>();
	for (const { fen } of whitePositions) seen.add(fen);
	for (const { fen } of blackPositions) seen.add(fen);
	return [...seen];
}

export async function computeAndPersistMaiaRating(
	opts: ComputeAndPersistMaiaRatingOpts,
): Promise<void> {
	const { db, cache, analysisJobId, whitePositions, blackPositions } = opts;

	if (await isAlreadyPersisted(db, analysisJobId)) return;

	const uniqueFens = collectUniqueFens(whitePositions, blackPositions);
	const t0 = Date.now();
	console.log(
		`[maia-rating] ${analysisJobId} starting — ${uniqueFens.length} unique positions`,
	);

	// Enqueue Maia jobs for any cache misses and poll until all are satisfied.
	// skipStockfish=true because the legacy per-move Stockfish path is already done.
	const tEnsureStart = Date.now();
	await ensureAnalyzed(uniqueFens, PRODUCTION_MAIA_VERSIONS, cache, {
		wait: true,
		skipStockfish: true,
	});
	const ensureMs = Date.now() - tEnsureStart;

	const maiaMap = await cache.getMaiaBatch(
		uniqueFens,
		PRODUCTION_MAIA_VERSIONS.maiaVersion,
	);

	const whiteResult = estimateGameSideRating("white", whitePositions, maiaMap);
	const blackResult = estimateGameSideRating("black", blackPositions, maiaMap);

	await db
		.update(analysisJobs)
		.set({
			maiaVersion: PRODUCTION_MAIA_VERSIONS.maiaVersion,
			maiaPredictedWhite: whiteResult?.predicted ?? null,
			maiaCiLowWhite: whiteResult?.ciLow ?? null,
			maiaCiHighWhite: whiteResult?.ciHigh ?? null,
			maiaNPositionsWhite: whiteResult?.nPositions ?? null,
			maiaPredictedBlack: blackResult?.predicted ?? null,
			maiaCiLowBlack: blackResult?.ciLow ?? null,
			maiaCiHighBlack: blackResult?.ciHigh ?? null,
			maiaNPositionsBlack: blackResult?.nPositions ?? null,
		})
		.where(eq(analysisJobs.id, analysisJobId));

	const totalMs = Date.now() - t0;
	console.log(
		`[maia-rating] ${analysisJobId} done in ${totalMs}ms (ensure ${ensureMs}ms) — white: ${whiteResult?.predicted?.toFixed(0) ?? "n/a"}, black: ${blackResult?.predicted?.toFixed(0) ?? "n/a"}`,
	);
}
