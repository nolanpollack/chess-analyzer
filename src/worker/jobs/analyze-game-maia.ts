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
			// allSettled so one slow/timing-out handler does not abort sibling
			// jobs in the batch. Each handler is fully independent and idempotent
			// (computeAndPersistMaiaRating short-circuits via isAlreadyPersisted),
			// so retrying the whole batch on partial failure is cheap.
			const results = await Promise.allSettled(
				jobs.map((j) => handleAnalyzeGameMaia(j.data)),
			);
			let rejected = 0;
			for (let i = 0; i < results.length; i++) {
				const r = results[i];
				if (r.status === "rejected") {
					rejected++;
					console.error(
						`[analyze-game-maia] job ${jobs[i].data.analysisJobId} failed:`,
						r.reason,
					);
				}
			}
			if (rejected > 0) {
				// Throw so pg-boss retries the batch. Successful siblings will
				// short-circuit on retry via isAlreadyPersisted; failed jobs get
				// another attempt (subject to retryLimit on the parent send).
				throw new Error(
					`${rejected}/${jobs.length} analyze-game-maia jobs failed in batch`,
				);
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
