import { Chess } from "chess.js";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgBoss } from "pg-boss";
import { ANALYSIS_CONFIG } from "#/config/analysis";
import {
	type Concept,
	gameAnalyses,
	gamePerformance,
	games,
	type MoveAnalysis,
	type MoveClassification,
	moveTags,
} from "#/db/schema";
import { env } from "#/env";
import {
	classifyMove,
	computeAccuracy,
	computeEvalDelta,
	detectConcepts,
	getGamePhase,
	getPiecesInvolved,
	type PgnMove,
	walkPgn,
} from "#/lib/chess-analysis";
import { computeGamePerformance, type MoveTagData } from "#/lib/performance";
import type { AnalysisEngine } from "#/providers/analysis-engine";
import { createStockfishWasmEngine } from "#/providers/stockfish-wasm-engine";

const ENGINE_DEPTH =
	Number(process.env.ANALYSIS_ENGINE_DEPTH) || ANALYSIS_CONFIG.engineDepth;

// ── Job Types ──────────────────────────────────────────────────────────

export const ANALYZE_GAME_QUEUE = "analyze-game";

export type AnalyzeGamePayload = {
	gameId: string;
};

// ── Registration ──────────────────────────────────────────────────────

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

// ── Types ─────────────────────────────────────────────────────────────

type PositionEval = {
	evalCp: number;
	bestMoveUci: string;
	bestMoveSan: string;
};

type GameData = {
	pgn: string;
	playerColor: "white" | "black";
	playerId: string;
	openingEco: string | null;
	openingName: string | null;
};

// ── Top-level handler ─────────────────────────────────────────────────

async function handleAnalyzeGame(data: AnalyzeGamePayload) {
	const { gameId } = data;
	console.log(`[analyze-game] Starting analysis for game ${gameId}`);

	const db = drizzle(env.DATABASE_URL);

	if (await isAlreadyComplete(db, gameId)) {
		console.log(`[analyze-game] Game ${gameId} already analyzed, skipping`);
		return;
	}

	await ensureAnalysisRow(db, gameId);
	const game = await loadGame(db, gameId);
	const engine = createStockfishWasmEngine();

	try {
		await engine.init();
		const pgnMoves = walkPgn(game.pgn);
		await setTotalMoves(db, gameId, pgnMoves.length);

		const positionEvals = await evaluateAllPositions(
			engine,
			pgnMoves,
			db,
			gameId,
		);
		const { moveAnalyses, accuracyWhite, accuracyBlack } = buildMoveAnalyses(
			pgnMoves,
			positionEvals,
			game.playerColor,
		);

		await storeAnalysisResults(
			db,
			gameId,
			moveAnalyses,
			accuracyWhite,
			accuracyBlack,
			pgnMoves.length,
		);

		const analysisId = await getAnalysisId(db, gameId);
		if (analysisId) {
			const tagRows = buildTagRows(
				positionEvals,
				moveAnalyses,
				analysisId,
				game,
			);
			await insertMoveTags(db, analysisId, tagRows);
			await insertGamePerformance(
				db,
				analysisId,
				game.playerId,
				moveAnalyses,
				tagRows,
			);
		}

		console.log(
			`[analyze-game] Completed analysis for game ${gameId}: ${pgnMoves.length} moves, white accuracy ${accuracyWhite}%, black accuracy ${accuracyBlack}%`,
		);
	} catch (err) {
		console.error(`[analyze-game] Failed for game ${gameId}:`, err);
		await markFailed(db, gameId, err);
		throw err;
	} finally {
		await engine.destroy();
	}
}

// ── Helpers ───────────────────────────────────────────────────────────

async function isAlreadyComplete(
	db: NodePgDatabase,
	gameId: string,
): Promise<boolean> {
	const [existing] = await db
		.select({ status: gameAnalyses.status })
		.from(gameAnalyses)
		.where(eq(gameAnalyses.gameId, gameId));
	return existing?.status === "complete";
}

async function ensureAnalysisRow(
	db: NodePgDatabase,
	gameId: string,
): Promise<void> {
	const [existing] = await db
		.select({ status: gameAnalyses.status })
		.from(gameAnalyses)
		.where(eq(gameAnalyses.gameId, gameId));

	if (!existing) {
		await db.insert(gameAnalyses).values({
			gameId,
			engine: "stockfish-wasm",
			depth: ENGINE_DEPTH,
			moves: [],
			status: "pending",
		});
	}
}

async function loadGame(db: NodePgDatabase, gameId: string): Promise<GameData> {
	const [game] = await db
		.select({
			pgn: games.pgn,
			playerColor: games.playerColor,
			playerId: games.playerId,
			openingEco: games.openingEco,
			openingName: games.openingName,
		})
		.from(games)
		.where(eq(games.id, gameId));

	if (!game) {
		await db
			.update(gameAnalyses)
			.set({
				status: "failed",
				errorMessage: `Game ${gameId} not found in database`,
			})
			.where(eq(gameAnalyses.gameId, gameId));
		throw new Error(`Game ${gameId} not found`);
	}

	return game;
}

async function setTotalMoves(
	db: NodePgDatabase,
	gameId: string,
	totalMoves: number,
): Promise<void> {
	await db
		.update(gameAnalyses)
		.set({ totalMoves })
		.where(eq(gameAnalyses.gameId, gameId));
}

async function evaluateAllPositions(
	engine: AnalysisEngine,
	pgnMoves: PgnMove[],
	db: NodePgDatabase,
	gameId: string,
): Promise<Map<string, PositionEval>> {
	const evals = new Map<string, PositionEval>();

	for (let i = 0; i < pgnMoves.length; i++) {
		const move = pgnMoves[i];
		if (!evals.has(move.fenBefore)) {
			const result = await engine.analyzePosition(move.fenBefore, ENGINE_DEPTH);
			evals.set(move.fenBefore, {
				evalCp: result.eval_cp,
				bestMoveUci: result.best_move_uci,
				bestMoveSan: result.best_move_san,
			});
		}

		if ((i + 1) % 5 === 0 || i === pgnMoves.length - 1) {
			await db
				.update(gameAnalyses)
				.set({ movesAnalyzed: i + 1 })
				.where(eq(gameAnalyses.gameId, gameId));
		}
	}

	if (pgnMoves.length > 0) {
		const lastMove = pgnMoves[pgnMoves.length - 1];
		if (!evals.has(lastMove.fenAfter)) {
			const result = await engine.analyzePosition(
				lastMove.fenAfter,
				ENGINE_DEPTH,
			);
			evals.set(lastMove.fenAfter, {
				evalCp: result.eval_cp,
				bestMoveUci: result.best_move_uci,
				bestMoveSan: result.best_move_san,
			});
		}
	}

	return evals;
}

function buildMoveAnalyses(
	pgnMoves: PgnMove[],
	positionEvals: Map<string, PositionEval>,
	playerColor: "white" | "black",
): {
	moveAnalyses: MoveAnalysis[];
	accuracyWhite: number;
	accuracyBlack: number;
} {
	const isPlayerWhite = playerColor === "white";
	const moveAnalyses: MoveAnalysis[] = [];
	const whiteClassifications: MoveClassification[] = [];
	const blackClassifications: MoveClassification[] = [];

	for (const move of pgnMoves) {
		const beforeEval = positionEvals.get(move.fenBefore);
		const afterEval = positionEvals.get(move.fenAfter);

		if (!beforeEval || !afterEval) {
			console.warn(`[analyze-game] Missing eval for ply ${move.ply}, skipping`);
			continue;
		}

		const evalDelta = computeEvalDelta(
			beforeEval.evalCp,
			afterEval.evalCp,
			move.isWhite,
		);
		const classification = classifyMove(
			evalDelta,
			move.uci,
			beforeEval.bestMoveUci,
			beforeEval.evalCp,
			afterEval.evalCp,
			move.fenBefore,
			move.fenAfter,
			move.isWhite,
		);

		moveAnalyses.push({
			ply: move.ply,
			san: move.san,
			uci: move.uci,
			fen_before: move.fenBefore,
			fen_after: move.fenAfter,
			eval_before: beforeEval.evalCp,
			eval_after: afterEval.evalCp,
			eval_delta: evalDelta,
			best_move_uci: beforeEval.bestMoveUci,
			best_move_san: beforeEval.bestMoveSan,
			classification,
			is_player_move: move.isWhite === isPlayerWhite,
		});

		if (move.isWhite) {
			whiteClassifications.push(classification);
		} else {
			blackClassifications.push(classification);
		}
	}

	return {
		moveAnalyses,
		accuracyWhite: computeAccuracy(whiteClassifications),
		accuracyBlack: computeAccuracy(blackClassifications),
	};
}

async function storeAnalysisResults(
	db: NodePgDatabase,
	gameId: string,
	moveAnalyses: MoveAnalysis[],
	accuracyWhite: number,
	accuracyBlack: number,
	totalMoves: number,
): Promise<void> {
	await db
		.update(gameAnalyses)
		.set({
			moves: moveAnalyses,
			accuracyWhite,
			accuracyBlack,
			movesAnalyzed: totalMoves,
			status: "complete",
			analyzedAt: new Date(),
		})
		.where(eq(gameAnalyses.gameId, gameId));
}

async function getAnalysisId(
	db: NodePgDatabase,
	gameId: string,
): Promise<string | null> {
	const [row] = await db
		.select({ id: gameAnalyses.id })
		.from(gameAnalyses)
		.where(eq(gameAnalyses.gameId, gameId));
	return row?.id ?? null;
}

type TagRow = {
	gameAnalysisId: string;
	playerId: string;
	ply: number;
	gamePhase: "opening" | "middlegame" | "endgame";
	piecesInvolved: ("pawn" | "knight" | "bishop" | "rook" | "queen" | "king")[];
	openingEco: string | null;
	openingName: string | null;
	concepts: Concept[];
};

function buildTagRows(
	positionEvals: Map<string, PositionEval>,
	moveAnalyses: MoveAnalysis[],
	analysisId: string,
	game: GameData,
): TagRow[] {
	return moveAnalyses.map((move) => {
		const phase = getGamePhase(move.ply, move.fen_after);
		const pieces = getPiecesInvolved(move.san, move.uci, move.fen_before);

		const beforeEval = positionEvals.get(move.fen_before);
		let bestMoveFenAfter = move.fen_after;
		if (beforeEval?.bestMoveUci) {
			try {
				const chess = new Chess(move.fen_before);
				const uci = beforeEval.bestMoveUci;
				// from+to+promotion
				chess.move({
					from: uci.slice(0, 2),
					to: uci.slice(2, 4),
					promotion: uci.slice(4, 5) || undefined,
				});
				bestMoveFenAfter = chess.fen();
			} catch (_e) {}
		}
		const concepts = detectConcepts(
			move,
			move.fen_before,
			move.fen_after,
			bestMoveFenAfter,
		);

		return {
			gameAnalysisId: analysisId,
			playerId: game.playerId,
			ply: move.ply,
			gamePhase: phase,
			piecesInvolved: pieces,
			openingEco: phase === "opening" ? game.openingEco : null,
			openingName: phase === "opening" ? game.openingName : null,
			concepts,
		};
	});
}

async function insertMoveTags(
	db: NodePgDatabase,
	analysisId: string,
	tagRows: TagRow[],
): Promise<void> {
	await db.delete(moveTags).where(eq(moveTags.gameAnalysisId, analysisId));
	if (tagRows.length > 0) {
		await db.insert(moveTags).values(tagRows);
	}
}

async function insertGamePerformance(
	db: NodePgDatabase,
	analysisId: string,
	playerId: string,
	moveAnalyses: MoveAnalysis[],
	tagRows: TagRow[],
): Promise<void> {
	const tagData: MoveTagData[] = tagRows.map((t) => ({
		ply: t.ply,
		gamePhase: t.gamePhase,
		piecesInvolved: t.piecesInvolved,
		openingEco: t.openingEco,
		openingName: t.openingName,
		concepts: t.concepts,
	}));

	const perf = computeGamePerformance(moveAnalyses, tagData);

	await db
		.insert(gamePerformance)
		.values({
			gameAnalysisId: analysisId,
			playerId,
			...perf,
		})
		.onConflictDoUpdate({
			target: gamePerformance.gameAnalysisId,
			set: { ...perf, computedAt: new Date() },
		});
}

async function markFailed(
	db: NodePgDatabase,
	gameId: string,
	err: unknown,
): Promise<void> {
	await db
		.update(gameAnalyses)
		.set({
			status: "failed",
			errorMessage: err instanceof Error ? err.message : "Unknown error",
		})
		.where(eq(gameAnalyses.gameId, gameId));
}
