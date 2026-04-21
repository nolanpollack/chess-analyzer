import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ANALYSIS_CONFIG } from "#/config/analysis";
import { db } from "#/db/index";
import { gameAnalyses } from "#/db/schema";
import { ensureQueue, getBoss } from "#/lib/queue";
import {
	ANALYZE_GAME_QUEUE,
	type AnalyzeGamePayload,
} from "#/worker/jobs/analyze-game";

export const triggerAnalysis = createServerFn({ method: "POST" })
	.inputValidator(z.object({ gameId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const { gameId } = data;

		try {
			const [existing] = await db
				.select({ status: gameAnalyses.status })
				.from(gameAnalyses)
				.where(eq(gameAnalyses.gameId, gameId));

			if (existing?.status === "complete" || existing?.status === "pending") {
				return { enqueued: false };
			}

			if (existing?.status === "failed") {
				await db
					.update(gameAnalyses)
					.set({ status: "pending", errorMessage: null, movesAnalyzed: 0 })
					.where(eq(gameAnalyses.gameId, gameId));
			} else {
				// Create the row immediately so the UI can show "pending" without
				// waiting for the worker.
				await db.insert(gameAnalyses).values({
					gameId,
					engine: "stockfish-wasm",
					depth: ANALYSIS_CONFIG.engineDepth,
					moves: [],
					status: "pending",
				});
			}

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

export const resetAndTriggerAnalysis = createServerFn({ method: "POST" })
	.inputValidator(z.object({ gameId: z.string().uuid() }))
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
