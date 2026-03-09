import { PgBoss } from "pg-boss";
import { env } from "#/env";
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
}

start().catch((err: unknown) => {
	console.error("[worker] failed to start", err);
	process.exit(1);
});
