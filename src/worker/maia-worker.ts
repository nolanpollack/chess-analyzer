import { PgBoss } from "pg-boss";
import { env } from "#/env";
import {
	ANALYZE_GAME_MAIA_QUEUE,
	registerAnalyzeGameMaiaJob,
} from "#/worker/jobs/analyze-game-maia";
import {
	ANALYZE_POSITION_MAIA,
	registerAnalyzePositionMaiaJob,
} from "#/worker/jobs/analyze-position-maia";

export async function startMaiaWorker(): Promise<void> {
	const boss = new PgBoss(env.DATABASE_URL);
	boss.on("error", (err: Error) => console.error("[maia-worker error]", err));
	await boss.start();
	console.log("[maia-worker] started");

	await boss.createQueue(ANALYZE_GAME_MAIA_QUEUE);
	registerAnalyzeGameMaiaJob(boss);
	console.log("[maia-worker] registered analyze-game-maia handler");

	await boss.createQueue(ANALYZE_POSITION_MAIA);
	registerAnalyzePositionMaiaJob(boss);
	console.log("[maia-worker] registered analyze-position-maia handler");
}
