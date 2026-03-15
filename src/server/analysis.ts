import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ANALYSIS_CONFIG } from "#/config/analysis";
import { db } from "#/db/index";
import { gameAnalyses, games } from "#/db/schema";
import { ensureQueue, getBoss } from "#/lib/queue";
import {
	ANALYZE_GAME_QUEUE,
	type AnalyzeGamePayload,
} from "#/worker/jobs/analyze-game";

// ── getGameWithAnalysis ────────────────────────────────────────────────

export const getGameWithAnalysis = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			gameId: z.string().uuid(),
		}),
	)
	.handler(async ({ data }) => {
		const { gameId } = data;

		try {
			const [game] = await db.select().from(games).where(eq(games.id, gameId));

			if (!game) {
				return { game: null, analysis: null };
			}

			const [analysis] = await db
				.select()
				.from(gameAnalyses)
				.where(eq(gameAnalyses.gameId, gameId));

			return {
				game: {
					...game,
					playedAt: game.playedAt.toISOString(),
					fetchedAt: game.fetchedAt.toISOString(),
				},
				analysis: analysis
					? {
							...analysis,
							analyzedAt: analysis.analyzedAt?.toISOString() ?? null,
							createdAt: analysis.createdAt.toISOString(),
						}
					: null,
			};
		} catch (err) {
			console.error("[getGameWithAnalysis] Error:", err);
			return { error: "Failed to load analysis" };
		}
	});

// ── getAnalysisStatus ──────────────────────────────────────────────────

export const getAnalysisStatus = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			gameId: z.string().uuid(),
		}),
	)
	.handler(async ({ data }) => {
		const { gameId } = data;

		try {
			const [analysis] = await db
				.select({
					status: gameAnalyses.status,
					movesAnalyzed: gameAnalyses.movesAnalyzed,
					totalMoves: gameAnalyses.totalMoves,
					errorMessage: gameAnalyses.errorMessage,
				})
				.from(gameAnalyses)
				.where(eq(gameAnalyses.gameId, gameId));

			if (!analysis) {
				return {
					status: null as null,
					movesAnalyzed: 0,
					totalMoves: null,
					error: undefined,
				};
			}

			return {
				status: analysis.status,
				movesAnalyzed: analysis.movesAnalyzed,
				totalMoves: analysis.totalMoves,
				error: analysis.errorMessage ?? undefined,
			};
		} catch (err) {
			console.error("[getAnalysisStatus] Error:", err);
			return { error: "Failed to get analysis status" };
		}
	});

// ── resetAndTriggerAnalysis ────────────────────────────────────────────

export const resetAndTriggerAnalysis = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			gameId: z.string().uuid(),
		}),
	)
	.handler(async ({ data }) => {
		const { gameId } = data;

		try {
			await db
				.update(gameAnalyses)
				.set({
					status: "pending",
					moves: [],
					movesAnalyzed: 0,
					totalMoves: null,
					errorMessage: null,
					analyzedAt: null,
				})
				.where(eq(gameAnalyses.gameId, gameId));

			await ensureQueue(ANALYZE_GAME_QUEUE);
			const boss = await getBoss();
			await boss.send(ANALYZE_GAME_QUEUE, {
				gameId,
			} satisfies AnalyzeGamePayload);

			return { enqueued: true };
		} catch (err) {
			console.error("[resetAndTriggerAnalysis] Error:", err);
			return { error: "Failed to reset analysis" };
		}
	});

// ── triggerAnalysis ────────────────────────────────────────────────────

export const triggerAnalysis = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			gameId: z.string().uuid(),
		}),
	)
	.handler(async ({ data }) => {
		const { gameId } = data;

		try {
			// Check if analysis already exists
			const [existing] = await db
				.select({ status: gameAnalyses.status })
				.from(gameAnalyses)
				.where(eq(gameAnalyses.gameId, gameId));

			if (existing?.status === "complete" || existing?.status === "pending") {
				return { enqueued: false };
			}

			if (existing?.status === "failed") {
				// Reset failed analysis to pending
				await db
					.update(gameAnalyses)
					.set({ status: "pending", errorMessage: null, movesAnalyzed: 0 })
					.where(eq(gameAnalyses.gameId, gameId));
			} else {
				// Create the row immediately so the UI can show "pending" without waiting for the worker
				await db.insert(gameAnalyses).values({
					gameId,
					engine: "stockfish-wasm",
					depth: ANALYSIS_CONFIG.engineDepth,
					moves: [],
					status: "pending",
				});
			}

			// Enqueue the job
			await ensureQueue(ANALYZE_GAME_QUEUE);
			const boss = await getBoss();
			await boss.send(ANALYZE_GAME_QUEUE, {
				gameId,
			} satisfies AnalyzeGamePayload);

			return { enqueued: true };
		} catch (err) {
			console.error("[triggerAnalysis] Error:", err);
			return { error: "Failed to trigger analysis" };
		}
	});
