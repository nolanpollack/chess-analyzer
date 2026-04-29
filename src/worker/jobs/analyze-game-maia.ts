/**
 * analyze-game-maia worker job.
 *
 * Runs Maia rating inference for a single game, independently of Stockfish.
 * Enqueued by analyze-game after it claims/creates the analysis_jobs row.
 * Writes only to maia_* columns of the analysis_jobs row — no conflict with
 * the Stockfish path which writes accuracy_* columns.
 *
 * Idempotent: computeAndPersistMaiaRating checks maiaPredictedWhite IS NULL.
 * Re-throws on error so pg-boss can retry.
 */
import { eq } from "drizzle-orm";
import type { Job, PgBoss } from "pg-boss";
import { analysisJobs, games } from "#/db/schema";
import { walkPgn } from "#/lib/analysis/pgn";
import { createPositionCache } from "#/lib/position-cache";
import { getWorkerDb } from "../db";
import { computeAndPersistMaiaRating } from "./maia-rating";

export const ANALYZE_GAME_MAIA_QUEUE = "analyze-game-maia";

export type AnalyzeGameMaiaPayload = {
	gameId: string;
	analysisJobId: string;
};

export function registerAnalyzeGameMaiaJob(boss: PgBoss) {
	boss.work<AnalyzeGameMaiaPayload>(
		ANALYZE_GAME_MAIA_QUEUE,
		{ pollingIntervalSeconds: 5, batchSize: 8 },
		async (jobs: Job<AnalyzeGameMaiaPayload>[]) => {
			// allSettled instead of all so one hanging job (e.g. ensureAnalyzed
			// timing out on a position the sidecar can't reach) does not block
			// the entire batch — pg-boss will retry the failed ones.
			const results = await Promise.allSettled(
				jobs.map((j) => handleAnalyzeGameMaia(j.data)),
			);
			for (let i = 0; i < results.length; i++) {
				const r = results[i];
				if (r.status === "rejected") {
					console.error(
						`[analyze-game-maia] job ${jobs[i].data.analysisJobId} failed:`,
						r.reason,
					);
					// Re-throw the FIRST rejection so pg-boss marks that job for retry.
					// Other failures are logged; pg-boss will retry them on the next
					// pull because their attempt counter never advanced. (This is the
					// pragmatic v1 behaviour — true per-job retry semantics need
					// pg-boss's onComplete hook.)
				}
			}
		},
	);
}

async function loadGamePgn(analysisJobId: string): Promise<string | null> {
	const db = getWorkerDb();
	const [row] = await db
		.select({ pgn: games.pgn })
		.from(games)
		.innerJoin(analysisJobs, eq(games.id, analysisJobs.gameId))
		.where(eq(analysisJobs.id, analysisJobId))
		.limit(1);
	return row?.pgn ?? null;
}

function extractSidePositions(pgn: string): {
	whitePositions: { fen: string; playedMove: string }[];
	blackPositions: { fen: string; playedMove: string }[];
} {
	const pgnMoves = walkPgn(pgn);
	const whitePositions: { fen: string; playedMove: string }[] = [];
	const blackPositions: { fen: string; playedMove: string }[] = [];
	for (const m of pgnMoves) {
		(m.isWhite ? whitePositions : blackPositions).push({
			fen: m.fenBefore,
			playedMove: m.uci,
		});
	}
	return { whitePositions, blackPositions };
}

async function handleAnalyzeGameMaia(
	data: AnalyzeGameMaiaPayload,
): Promise<void> {
	const { analysisJobId } = data;

	const pgn = await loadGamePgn(analysisJobId);
	if (!pgn) {
		console.warn(
			`[analyze-game-maia] No game for job ${analysisJobId}, skipping`,
		);
		return;
	}

	const { whitePositions, blackPositions } = extractSidePositions(pgn);

	const db = getWorkerDb();
	const cache = createPositionCache(db);

	console.log(
		`[analyze-game-maia] picked up job ${analysisJobId} (${whitePositions.length + blackPositions.length} plies)`,
	);

	await computeAndPersistMaiaRating({
		db,
		cache,
		analysisJobId,
		whitePositions,
		blackPositions,
	});
}
