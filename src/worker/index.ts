import { PgBoss } from "pg-boss";
import { env } from "#/env";

const boss = new PgBoss(env.DATABASE_URL);

boss.on("error", (err: Error) => console.error("[pg-boss error]", err));

async function start() {
	await boss.start();
	console.log("[worker] started");

	// Job handlers registered here in later phases:
	// import and register from src/worker/jobs/
}

start().catch((err: unknown) => {
	console.error("[worker] failed to start", err);
	process.exit(1);
});
