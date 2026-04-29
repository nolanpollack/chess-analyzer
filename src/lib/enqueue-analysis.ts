import { ensureQueue, getBoss } from "#/lib/queue";
import {
	ANALYZE_GAME_QUEUE,
	type AnalyzeGamePayload,
} from "#/worker/jobs/analyze-game";

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
