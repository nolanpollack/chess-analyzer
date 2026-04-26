import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { ANALYSIS_CONFIG } from "#/config/analysis";
import { db } from "#/db/index";
import { analysisJobs } from "#/db/schema";
import { ensureQueue, getBoss } from "#/lib/queue";
import {
	ANALYZE_GAME_QUEUE,
	type AnalyzeGamePayload,
	PIPELINE_VERSION,
} from "#/worker/jobs/analyze-game";

const ENGINE = "stockfish-wasm";

async function enqueueAnalysis(gameId: string) {
	await ensureQueue(ANALYZE_GAME_QUEUE);
	const boss = await getBoss();
	await boss.send(ANALYZE_GAME_QUEUE, {
		gameId,
	} satisfies AnalyzeGamePayload);
}

export const triggerAnalysis = createServerFn({ method: "POST" })
	.inputValidator(z.object({ gameId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const { gameId } = data;

		try {
			const [latest] = await db
				.select({ status: analysisJobs.status, id: analysisJobs.id })
				.from(analysisJobs)
				.where(eq(analysisJobs.gameId, gameId))
				.orderBy(desc(analysisJobs.enqueuedAt))
				.limit(1);

			if (
				latest?.status === "complete" ||
				latest?.status === "queued" ||
				latest?.status === "running"
			) {
				return { enqueued: false };
			}

			// No job, or last attempt failed → create a fresh queued job.
			await db.insert(analysisJobs).values({
				gameId,
				engine: ENGINE,
				depth: ANALYSIS_CONFIG.engineDepth,
				pipelineVersion: PIPELINE_VERSION,
				status: "queued",
			});

			await enqueueAnalysis(gameId);
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
			// Re-analysis: insert a new job rather than mutating prior state.
			// The worker writes a fresh moves/move_tags batch keyed on this job.
			await db.insert(analysisJobs).values({
				gameId,
				engine: ENGINE,
				depth: ANALYSIS_CONFIG.engineDepth,
				pipelineVersion: PIPELINE_VERSION,
				status: "queued",
			});

			await enqueueAnalysis(gameId);
			return { enqueued: true };
		} catch (err) {
			console.error("[resetAndTriggerAnalysis] Error:", err);
			return { error: "Failed to reset analysis" };
		}
	});
