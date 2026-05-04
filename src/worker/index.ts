import { startMaiaWorker } from "./maia-worker";
import { startStockfishWorker } from "./stockfish-worker";

async function start() {
	await Promise.all([startStockfishWorker(), startMaiaWorker()]);
}

start().catch((err: unknown) => {
	console.error("[worker] failed to start", err);
	process.exit(1);
});
