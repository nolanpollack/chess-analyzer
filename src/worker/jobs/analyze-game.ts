/**
 * analyze-game worker job.
 *
 * Pipeline:
 *   1. Claim/create the analysis_jobs row, mark `running`.
 *   2. Walk PGN, run Stockfish on each unique position.
 *   3. Insert one `moves` row per ply (engine output stored as columns).
 *   4. Run every registered tag generator over the moves; batch-insert
 *      the resulting `move_tags` rows.
 *   5. Mark the job `complete` with overall accuracies.
 *
 * Idempotent: re-running on the same job deletes prior moves + tags
 * before reinsertion. Generators live in src/lib/tagging/.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgBoss } from "pg-boss";
import { ANALYSIS_CONFIG } from "#/config/analysis";
import { analysisJobs, games, moves, moveTags } from "#/db/schema";
import { env } from "#/env";
import {
	computeEvalDelta,
	computeMoveAccuracy,
	cpToWinPct,
	type MoveEvalData,
} from "#/lib/analysis/accuracy";
import { type PgnMove, walkPgn } from "#/lib/analysis/pgn";
import { classifyMove, type PrevMoveContext } from "#/lib/move-classification";
import { invalidatePlayerCache } from "#/lib/scoring/cache";
import { moveComplexity } from "#/lib/scoring/complexity";
import { computeGameAccuracy } from "#/lib/scoring/game-accuracy";
import {
	computeWeightedAccuracy,
	type WeightedMove,
} from "#/lib/scoring/weighted-accuracy";
import { runGeneratorsForMove } from "#/lib/tagging/registry";
import type { Move } from "#/lib/tagging/types";
import type { AnalysisEngine, PositionEval } from "#/providers/analysis-engine";
import { createStockfishWasmEngine } from "#/providers/stockfish-wasm-engine";

export const ANALYZE_GAME_QUEUE = "analyze-game";
export const PIPELINE_VERSION = "v1";

const ENGINE_DEPTH =
	Number(process.env.ANALYSIS_ENGINE_DEPTH) || ANALYSIS_CONFIG.engineDepth;
const ENGINE_NAME = "stockfish-wasm";

export type AnalyzeGamePayload = {
	gameId: string;
};

export function registerAnalyzeGameJob(boss: PgBoss) {
	boss.work<AnalyzeGamePayload>(
		ANALYZE_GAME_QUEUE,
		{
			pollingIntervalSeconds: 5,
			batchSize: 1,
		},
		async (jobs) => {
			for (const job of jobs) {
				await handleAnalyzeGame(job.data);
			}
		},
	);
}

type CachedPositionEval = {
	evalCp: number;
	bestMoveUci: string;
	bestMoveSan: string;
	/** Eval of the second-best PV (side-to-move perspective), null if only one PV. */
	pv2EvalCp: number | null;
};

type GameRow = {
	pgn: string;
	playerColor: "white" | "black";
	playerId: string;
};

async function handleAnalyzeGame(data: AnalyzeGamePayload) {
	const { gameId } = data;
	console.log(`[analyze-game] Starting analysis for game ${gameId}`);

	const db = drizzle(env.DATABASE_URL);
	const jobId = await claimOrCreateJob(db, gameId);

	if (!jobId) {
		console.log(`[analyze-game] Game ${gameId} already analyzed, skipping`);
		return;
	}

	const game = await loadGame(db, gameId);
	const engine = createStockfishWasmEngine();

	try {
		await engine.init();
		const pgnMoves = walkPgn(game.pgn);
		await db
			.update(analysisJobs)
			.set({
				totalMoves: pgnMoves.length,
				startedAt: new Date(),
				status: "running",
			})
			.where(eq(analysisJobs.id, jobId));

		const positionEvals = await evaluateAllPositions(
			engine,
			pgnMoves,
			db,
			jobId,
		);

		const {
			moveRows,
			accuracyWhite,
			accuracyBlack,
			weightedAccuracyWhite,
			weightedAccuracyBlack,
		} = buildMoveRows({
			pgnMoves,
			positionEvals,
			playerColor: game.playerColor,
			playerId: game.playerId,
			gameId,
			analysisJobId: jobId,
		});

		// Replace any prior moves + tags for this job (re-run safety).
		// move_tags FK to moves so the moves delete cascades via the explicit
		// tag delete below.
		await deleteJobTags(db, jobId);
		await db.delete(moves).where(eq(moves.analysisJobId, jobId));

		let insertedMoves: Move[] = [];
		if (moveRows.length > 0) {
			insertedMoves = await db.insert(moves).values(moveRows).returning();
		}

		await runAndInsertTags(db, insertedMoves, await loadGameRow(db, gameId));

		await db
			.update(analysisJobs)
			.set({
				accuracyWhite,
				accuracyBlack,
				weightedAccuracyWhite,
				weightedAccuracyBlack,
				movesAnalyzed: pgnMoves.length,
				status: "complete",
				completedAt: new Date(),
			})
			.where(eq(analysisJobs.id, jobId));

		await invalidatePlayerCache(db, game.playerId);

		console.log(
			`[analyze-game] Completed game ${gameId}: ${pgnMoves.length} moves, white ${accuracyWhite}%, black ${accuracyBlack}%`,
		);
	} catch (err) {
		console.error(`[analyze-game] Failed for game ${gameId}:`, err);
		await markFailed(db, jobId, err);
		throw err;
	} finally {
		await engine.destroy();
	}
}

/**
 * Reuse an existing queued job, or insert a new one. Returns null when the
 * latest job is already complete (idempotent skip).
 */
async function claimOrCreateJob(
	db: NodePgDatabase,
	gameId: string,
): Promise<string | null> {
	const existing = await db
		.select({ id: analysisJobs.id, status: analysisJobs.status })
		.from(analysisJobs)
		.where(eq(analysisJobs.gameId, gameId))
		.orderBy(sql`${analysisJobs.enqueuedAt} DESC`)
		.limit(1);

	const latest = existing[0];

	if (latest?.status === "complete") return null;

	if (latest && (latest.status === "queued" || latest.status === "failed")) {
		await db
			.update(analysisJobs)
			.set({
				status: "running",
				attempts: sql`${analysisJobs.attempts} + 1`,
				errorMessage: null,
				movesAnalyzed: 0,
			})
			.where(eq(analysisJobs.id, latest.id));
		return latest.id;
	}

	if (latest?.status === "running") {
		// Pick it up — likely a previously-killed worker. The DELETE on
		// moves below makes restart safe.
		return latest.id;
	}

	const [created] = await db
		.insert(analysisJobs)
		.values({
			gameId,
			engine: ENGINE_NAME,
			depth: ENGINE_DEPTH,
			pipelineVersion: PIPELINE_VERSION,
			status: "running",
			attempts: 1,
			startedAt: new Date(),
		})
		.returning({ id: analysisJobs.id });

	return created.id;
}

async function loadGame(db: NodePgDatabase, gameId: string): Promise<GameRow> {
	const [game] = await db
		.select({
			pgn: games.pgn,
			playerColor: games.playerColor,
			playerId: games.playerId,
		})
		.from(games)
		.where(eq(games.id, gameId));

	if (!game) {
		throw new Error(`Game ${gameId} not found`);
	}
	return game;
}

async function loadGameRow(db: NodePgDatabase, gameId: string) {
	const [row] = await db.select().from(games).where(eq(games.id, gameId));
	if (!row) throw new Error(`Game ${gameId} not found`);
	return row;
}

async function deleteJobTags(db: NodePgDatabase, jobId: string): Promise<void> {
	const moveIds = await db
		.select({ id: moves.id })
		.from(moves)
		.where(eq(moves.analysisJobId, jobId));
	if (moveIds.length === 0) return;
	await db.delete(moveTags).where(
		inArray(
			moveTags.moveId,
			moveIds.map((m) => m.id),
		),
	);
}

async function runAndInsertTags(
	db: NodePgDatabase,
	allMoves: Move[],
	game: typeof games.$inferSelect,
): Promise<void> {
	if (allMoves.length === 0) return;

	const tagRows = allMoves.flatMap((move) =>
		runGeneratorsForMove({ move, game, allMoves }),
	);
	if (tagRows.length === 0) return;

	// Single batch insert. ~5–10 tags per move × 40 moves = a few hundred rows
	// per game; well within Postgres parameter limits.
	await db.insert(moveTags).values(tagRows);
}

/** Extract pv2 eval from side-to-move perspective given the engine result. */
function extractPv2SideToMove(
	result: PositionEval,
	isBlackToMove: boolean,
): number | null {
	if (result.pvs.length < 2) return null;
	const pv2WhitePerspective = result.pvs[1].eval_cp;
	// Convert back to side-to-move perspective for complexity computation
	return isBlackToMove ? -pv2WhitePerspective : pv2WhitePerspective;
}

async function evaluateAllPositions(
	engine: AnalysisEngine,
	pgnMoves: PgnMove[],
	db: NodePgDatabase,
	jobId: string,
): Promise<Map<string, CachedPositionEval>> {
	const evals = new Map<string, CachedPositionEval>();

	for (let i = 0; i < pgnMoves.length; i++) {
		const move = pgnMoves[i];
		if (!evals.has(move.fenBefore)) {
			const result = await engine.analyzePosition(move.fenBefore, ENGINE_DEPTH);
			const isBlackToMove = move.fenBefore.split(" ")[1] === "b";
			evals.set(move.fenBefore, {
				evalCp: result.eval_cp,
				bestMoveUci: result.best_move_uci,
				bestMoveSan: result.best_move_san,
				pv2EvalCp: extractPv2SideToMove(result, isBlackToMove),
			});
		}

		if ((i + 1) % 5 === 0 || i === pgnMoves.length - 1) {
			await db
				.update(analysisJobs)
				.set({ movesAnalyzed: i + 1 })
				.where(eq(analysisJobs.id, jobId));
		}
	}

	if (pgnMoves.length > 0) {
		const lastMove = pgnMoves[pgnMoves.length - 1];
		if (!evals.has(lastMove.fenAfter)) {
			const result = await engine.analyzePosition(
				lastMove.fenAfter,
				ENGINE_DEPTH,
			);
			const isBlackToMove = lastMove.fenAfter.split(" ")[1] === "b";
			evals.set(lastMove.fenAfter, {
				evalCp: result.eval_cp,
				bestMoveUci: result.best_move_uci,
				bestMoveSan: result.best_move_san,
				pv2EvalCp: extractPv2SideToMove(result, isBlackToMove),
			});
		}
	}

	return evals;
}

type MoveRow = typeof moves.$inferInsert;

type BuildMoveRowsResult = {
	moveRows: MoveRow[];
	accuracyWhite: number;
	accuracyBlack: number;
	weightedAccuracyWhite: number;
	weightedAccuracyBlack: number;
};

function buildMoveRows(args: {
	pgnMoves: PgnMove[];
	positionEvals: Map<string, CachedPositionEval>;
	playerColor: "white" | "black";
	playerId: string;
	gameId: string;
	analysisJobId: string;
}): BuildMoveRowsResult {
	const isPlayerWhite = args.playerColor === "white";
	const moveRows: MoveRow[] = [];
	const allEvals: MoveEvalData[] = [];
	const allWeightedMoves: WeightedMove[] = [];
	let prevWinPctLost: number | null = null;

	for (const move of args.pgnMoves) {
		const before = args.positionEvals.get(move.fenBefore);
		const after = args.positionEvals.get(move.fenAfter);

		if (!before || !after) {
			console.warn(`[analyze-game] Missing eval for ply ${move.ply}, skipping`);
			continue;
		}

		const evalDelta = computeEvalDelta(
			before.evalCp,
			after.evalCp,
			move.isWhite,
		);

		const winPctBefore = move.isWhite
			? cpToWinPct(before.evalCp)
			: 100 - cpToWinPct(before.evalCp);
		const winPctAfter = move.isWhite
			? cpToWinPct(after.evalCp)
			: 100 - cpToWinPct(after.evalCp);
		const winPctLost = Math.max(0, winPctBefore - winPctAfter);

		const prevContext: PrevMoveContext | undefined =
			prevWinPctLost !== null
				? { opponentWinPctLost: prevWinPctLost }
				: undefined;

		const classification = classifyMove(
			move.uci,
			before.bestMoveUci,
			before.evalCp,
			after.evalCp,
			move.fenBefore,
			move.fenAfter,
			move.isWhite,
			prevContext,
		);

		prevWinPctLost = winPctLost;

		const isPlayerMove = move.isWhite === isPlayerWhite;

		const evalData: MoveEvalData = {
			evalBefore: before.evalCp,
			evalAfter: after.evalCp,
			isWhite: move.isWhite,
		};
		const accuracyScore = computeMoveAccuracy(evalData);

		// Complexity: pv1 is white-perspective; convert to side-to-move for comparison.
		const pv1SideToMove = move.isWhite ? before.evalCp : -before.evalCp;
		const complexity = moveComplexity(pv1SideToMove, before.pv2EvalCp);

		moveRows.push({
			analysisJobId: args.analysisJobId,
			gameId: args.gameId,
			playerId: args.playerId,
			ply: move.ply,
			color: move.isWhite ? "white" : "black",
			isPlayerMove: isPlayerMove ? 1 : 0,
			san: move.san,
			uci: move.uci,
			fenBefore: move.fenBefore,
			fenAfter: move.fenAfter,
			engineBestUci: before.bestMoveUci,
			engineBestSan: before.bestMoveSan,
			evalBeforeCp: before.evalCp,
			evalAfterCp: after.evalCp,
			evalDeltaCp: evalDelta,
			classification,
			accuracyScore: isPlayerMove ? accuracyScore : null,
			complexity,
		});

		allEvals.push(evalData);
		allWeightedMoves.push({
			accuracy: accuracyScore,
			complexity,
			isWhite: move.isWhite,
		});
	}

	const gameAccuracy = computeGameAccuracy(allEvals);
	const weightedAccuracy = computeWeightedAccuracy(allWeightedMoves);

	return {
		moveRows,
		accuracyWhite: gameAccuracy?.white ?? 0,
		accuracyBlack: gameAccuracy?.black ?? 0,
		weightedAccuracyWhite: weightedAccuracy?.white ?? 0,
		weightedAccuracyBlack: weightedAccuracy?.black ?? 0,
	};
}

async function markFailed(
	db: NodePgDatabase,
	jobId: string,
	err: unknown,
): Promise<void> {
	await db
		.update(analysisJobs)
		.set({
			status: "failed",
			errorMessage: err instanceof Error ? err.message : "Unknown error",
			completedAt: new Date(),
		})
		.where(and(eq(analysisJobs.id, jobId)));
}
