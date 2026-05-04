import { PgBoss } from "pg-boss";
import { env } from "#/env";
import {
	ANALYZE_GAME_QUEUE,
	registerAnalyzeGameJob,
} from "#/worker/jobs/analyze-game";
import {
	ANALYZE_POSITION_STOCKFISH,
	registerAnalyzePositionStockfishJob,
} from "#/worker/jobs/analyze-position-stockfish";
import {
	RECONCILE_ANALYSIS_QUEUE,
	registerReconcileAnalysisJob,
} from "#/worker/jobs/reconcile-analysis";
import {
	registerSyncGamesJob,
	SYNC_GAMES_QUEUE,
} from "#/worker/jobs/sync-games";

export async function startStockfishWorker(): Promise<void> {
	const boss = new PgBoss(env.DATABASE_URL);
	boss.on("error", (err: Error) =>
		console.error("[stockfish-worker error]", err),
	);
	await boss.start();
	console.log("[stockfish-worker] started");

	await boss.createQueue(SYNC_GAMES_QUEUE);
	registerSyncGamesJob(boss);
	console.log("[stockfish-worker] registered sync-games handler");

	await boss.createQueue(ANALYZE_GAME_QUEUE);
	registerAnalyzeGameJob(boss);
	console.log("[stockfish-worker] registered analyze-game handler");

	await boss.createQueue(ANALYZE_POSITION_STOCKFISH);
	registerAnalyzePositionStockfishJob(boss);
	console.log(
		"[stockfish-worker] registered analyze-position-stockfish handler",
	);

	await boss.createQueue(RECONCILE_ANALYSIS_QUEUE);
	registerReconcileAnalysisJob(boss);
	await boss.schedule(RECONCILE_ANALYSIS_QUEUE, "*/10 * * * *");
	console.log(
		"[stockfish-worker] registered reconcile-analysis handler (every 10 min)",
	);
}
