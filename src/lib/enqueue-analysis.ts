import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
	ANALYSIS_CONFIG,
	ENGINE_NAME,
	PIPELINE_VERSION,
} from "#/config/analysis";
import type * as schema from "#/db/schema";
import { analysisJobs } from "#/db/schema";
import { ensureQueue, getBoss } from "#/lib/queue";
import {
	ANALYZE_GAME_QUEUE,
	type AnalyzeGamePayload,
} from "#/worker/jobs/analyze-game";
import {
	ANALYZE_GAME_MAIA_QUEUE,
	type AnalyzeGameMaiaPayload,
} from "#/worker/jobs/analyze-game-maia";

type Db = NodePgDatabase<typeof schema>;

/**
 * Pre-creates the analysis_jobs row then enqueues both the Stockfish and Maia
 * jobs. Call this everywhere a new analysis should start so both pipelines are
 * in flight immediately rather than Maia waiting on Stockfish's batchSize.
 */
export async function createAndEnqueueAnalysis(
	db: Db,
	gameId: string,
): Promise<void> {
	const [job] = await db
		.insert(analysisJobs)
		.values({
			gameId,
			engine: ENGINE_NAME,
			depth: ANALYSIS_CONFIG.engineDepth,
			pipelineVersion: PIPELINE_VERSION,
			status: "queued",
		})
		.returning({ id: analysisJobs.id });

	await enqueueGameAnalysis(gameId);
	await enqueueMaiaOnly(gameId, job.id);
}

/**
 * Single entry point for enqueueing analyze-game jobs.
 *
 * Encapsulates the retry policy (3 retries, exponential backoff) and the
 * singleton key that prevents concurrent duplicate enqueues for the same
 * game (e.g. a sync race against the reconcile-analysis cron).
 *
 * The worker's `claimOrCreateJob` is the second line of defence: even if
 * two pg-boss jobs slip through, the second invocation sees a `complete`
 * row and skips.
 */
export async function enqueueGameAnalysis(gameId: string): Promise<void> {
	await ensureQueue(ANALYZE_GAME_QUEUE);
	const boss = await getBoss();
	await boss.send(ANALYZE_GAME_QUEUE, { gameId } satisfies AnalyzeGamePayload, {
		retryLimit: 3,
		retryBackoff: true,
		singletonKey: `analyze-game:${gameId}`,
	});
}

/**
 * Enqueue a Maia-only run for an existing analysis_jobs row.
 *
 * Used by:
 *  - analyze-game (after Stockfish claims/creates the row, fans out Maia)
 *  - reconcile-analysis (recovers analysis_jobs whose Stockfish completed
 *    but whose maia_predicted_* columns are null — typically because a
 *    prior analyze-game-maia batch silently swallowed an error)
 *
 * Idempotent: `computeAndPersistMaiaRating` skips when `maiaPredictedWhite`
 * is already set, and `singletonKey` prevents concurrent duplicate sends
 * for the same `analysisJobId`.
 */
export async function enqueueMaiaOnly(
	gameId: string,
	analysisJobId: string,
): Promise<void> {
	await ensureQueue(ANALYZE_GAME_MAIA_QUEUE);
	const boss = await getBoss();
	await boss.send(
		ANALYZE_GAME_MAIA_QUEUE,
		{ gameId, analysisJobId } satisfies AnalyzeGameMaiaPayload,
		{
			retryLimit: 3,
			retryBackoff: true,
			singletonKey: `analyze-game-maia:${analysisJobId}`,
		},
	);
}
