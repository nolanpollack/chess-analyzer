import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgBoss } from "pg-boss";
import { ANALYSIS_CONFIG } from "#/config/analysis";
import { gameAnalyses, games, type MoveAnalysis } from "#/db/schema";
import { env } from "#/env";
import {
	classifyMove,
	computeAccuracy,
	computeEvalDelta,
	walkPgn,
} from "#/lib/chess-analysis";
import { createStockfishWasmEngine } from "#/providers/stockfish-wasm-engine";

// Allow overriding depth via env var without touching the shared config (which is also client-side)
const ENGINE_DEPTH =
	Number(process.env.ANALYSIS_ENGINE_DEPTH) || ANALYSIS_CONFIG.engineDepth;

// ── Job Types ──────────────────────────────────────────────────────────

export const ANALYZE_GAME_QUEUE = "analyze-game";

export type AnalyzeGamePayload = {
	gameId: string;
};

// ── Job Handler ────────────────────────────────────────────────────────

export function registerAnalyzeGameJob(boss: PgBoss) {
	boss.work<AnalyzeGamePayload>(
		ANALYZE_GAME_QUEUE,
		{
			pollingIntervalSeconds: 5,
			batchSize: 1, // One game at a time
		},
		async (jobs) => {
			for (const job of jobs) {
				await handleAnalyzeGame(job.data);
			}
		},
	);
}

async function handleAnalyzeGame(data: AnalyzeGamePayload) {
	const { gameId } = data;
	console.log(`[analyze-game] Starting analysis for game ${gameId}`);

	// Worker creates its own DB connection (per architecture rules)
	const db = drizzle(env.DATABASE_URL);

	// 1. Check if analysis already exists and is complete
	const [existing] = await db
		.select({ status: gameAnalyses.status })
		.from(gameAnalyses)
		.where(eq(gameAnalyses.gameId, gameId));

	if (existing?.status === "complete") {
		console.log(`[analyze-game] Game ${gameId} already analyzed, skipping`);
		return;
	}

	// 2. Upsert the analysis row as "pending" → will become "analyzing" status once we start
	//    Note: analysis_status enum has 'pending', 'complete', 'failed' — we use 'pending' while analyzing
	if (!existing) {
		await db.insert(gameAnalyses).values({
			gameId,
			engine: "stockfish-wasm",
			depth: ENGINE_DEPTH,
			moves: [],
			status: "pending",
		});
	}

	// 3. Load the game PGN and player color
	const [game] = await db
		.select({
			pgn: games.pgn,
			playerColor: games.playerColor,
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

	const engine = createStockfishWasmEngine();

	try {
		await engine.init();

		// 4. Parse PGN and walk through moves
		const pgnMoves = walkPgn(game.pgn);
		const totalMoves = pgnMoves.length;

		// Set total_moves for progress tracking
		await db
			.update(gameAnalyses)
			.set({ totalMoves })
			.where(eq(gameAnalyses.gameId, gameId));

		// 5. Analyze each position
		const positionEvals: Map<
			string,
			{ evalCp: number; bestMoveUci: string; bestMoveSan: string }
		> = new Map();

		for (let i = 0; i < pgnMoves.length; i++) {
			const move = pgnMoves[i];

			// Analyze position before the move (if not already analyzed)
			if (!positionEvals.has(move.fenBefore)) {
				const result = await engine.analyzePosition(
					move.fenBefore,
					ENGINE_DEPTH,
				);
				positionEvals.set(move.fenBefore, {
					evalCp: result.eval_cp,
					bestMoveUci: result.best_move_uci,
					bestMoveSan: result.best_move_san,
				});
			}

			// Update progress every 5 moves
			if ((i + 1) % 5 === 0 || i === pgnMoves.length - 1) {
				await db
					.update(gameAnalyses)
					.set({ movesAnalyzed: i + 1 })
					.where(eq(gameAnalyses.gameId, gameId));
			}
		}

		// 6. Analyze the final position (after last move)
		if (pgnMoves.length > 0) {
			const lastMove = pgnMoves[pgnMoves.length - 1];
			if (!positionEvals.has(lastMove.fenAfter)) {
				const result = await engine.analyzePosition(
					lastMove.fenAfter,
					ENGINE_DEPTH,
				);
				positionEvals.set(lastMove.fenAfter, {
					evalCp: result.eval_cp,
					bestMoveUci: result.best_move_uci,
					bestMoveSan: result.best_move_san,
				});
			}
		}

		// 7. Build MoveAnalysis array
		const isPlayerWhite = game.playerColor === "white";
		const moveAnalyses: MoveAnalysis[] = [];
		const whiteClassifications: (typeof moveAnalyses)[number]["classification"][] =
			[];
		const blackClassifications: (typeof moveAnalyses)[number]["classification"][] =
			[];

		for (const move of pgnMoves) {
			const beforeEval = positionEvals.get(move.fenBefore);
			const afterEval = positionEvals.get(move.fenAfter);

			if (!beforeEval || !afterEval) {
				console.warn(
					`[analyze-game] Missing eval for ply ${move.ply}, skipping`,
				);
				continue;
			}

			const evalBefore = beforeEval.evalCp;
			const evalAfter = afterEval.evalCp;
			const evalDelta = computeEvalDelta(evalBefore, evalAfter, move.isWhite);
			const classification = classifyMove(
				evalDelta,
				move.uci,
				beforeEval.bestMoveUci,
			);

			const isPlayerMove = move.isWhite === isPlayerWhite;

			moveAnalyses.push({
				ply: move.ply,
				san: move.san,
				uci: move.uci,
				fen_before: move.fenBefore,
				fen_after: move.fenAfter,
				eval_before: evalBefore,
				eval_after: evalAfter,
				eval_delta: evalDelta,
				best_move_uci: beforeEval.bestMoveUci,
				best_move_san: beforeEval.bestMoveSan,
				classification,
				is_player_move: isPlayerMove,
			});

			if (move.isWhite) {
				whiteClassifications.push(classification);
			} else {
				blackClassifications.push(classification);
			}
		}

		// 8. Compute accuracy
		const accuracyWhite = computeAccuracy(whiteClassifications);
		const accuracyBlack = computeAccuracy(blackClassifications);

		// 9. Store results
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

		console.log(
			`[analyze-game] Completed analysis for game ${gameId}: ${totalMoves} moves, white accuracy ${accuracyWhite}%, black accuracy ${accuracyBlack}%`,
		);
	} catch (err) {
		console.error(`[analyze-game] Failed for game ${gameId}:`, err);

		await db
			.update(gameAnalyses)
			.set({
				status: "failed",
				errorMessage: err instanceof Error ? err.message : "Unknown error",
			})
			.where(eq(gameAnalyses.gameId, gameId));

		throw err; // pg-boss will retry
	} finally {
		await engine.destroy();
	}
}
