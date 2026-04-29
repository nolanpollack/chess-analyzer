import { PgBoss } from "pg-boss";
import { env } from "#/env";
import {
	ANALYZE_GAME_QUEUE,
	registerAnalyzeGameJob,
} from "#/worker/jobs/analyze-game";
import {
	ANALYZE_GAME_MAIA_QUEUE,
	registerAnalyzeGameMaiaJob,
} from "#/worker/jobs/analyze-game-maia";
import {
	ANALYZE_POSITION_MAIA,
	registerAnalyzePositionMaiaJob,
} from "#/worker/jobs/analyze-position-maia";
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

const boss = new PgBoss(env.DATABASE_URL);

boss.on("error", (err: Error) => console.error("[pg-boss error]", err));

async function start() {
	await boss.start();
	console.log("[worker] started");

	await boss.createQueue(SYNC_GAMES_QUEUE);
	registerSyncGamesJob(boss);
	console.log("[worker] registered sync-games handler");

	await boss.createQueue(ANALYZE_GAME_QUEUE);
	registerAnalyzeGameJob(boss);
	console.log("[worker] registered analyze-game handler");

	await boss.createQueue(ANALYZE_GAME_MAIA_QUEUE);
	registerAnalyzeGameMaiaJob(boss);
	console.log("[worker] registered analyze-game-maia handler");

	await boss.createQueue(ANALYZE_POSITION_MAIA);
	registerAnalyzePositionMaiaJob(boss);
	console.log("[worker] registered analyze-position-maia handler");

	await boss.createQueue(ANALYZE_POSITION_STOCKFISH);
	registerAnalyzePositionStockfishJob(boss);
	console.log("[worker] registered analyze-position-stockfish handler");

	await boss.createQueue(RECONCILE_ANALYSIS_QUEUE);
	registerReconcileAnalysisJob(boss);
	await boss.schedule(RECONCILE_ANALYSIS_QUEUE, "*/10 * * * *");
	console.log("[worker] registered reconcile-analysis handler (every 10 min)");
}

start().catch((err: unknown) => {
	console.error("[worker] failed to start", err);
	process.exit(1);
});
