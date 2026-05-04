import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { analysisJobs } from "#/db/schema";
import { createAndEnqueueAnalysis } from "#/lib/enqueue-analysis";

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

			await createAndEnqueueAnalysis(db, gameId);
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
			await createAndEnqueueAnalysis(db, gameId);
			return { enqueued: true };
		} catch (err) {
			console.error("[resetAndTriggerAnalysis] Error:", err);
			return { error: "Failed to reset analysis" };
		}
	});
