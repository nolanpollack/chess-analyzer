/**
 * Analysis status queries — used to wire in-progress analysis to the profile
 * page row-level progress indicators.
 */
import { createServerFn } from "@tanstack/react-start";
import { desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { type AnalysisStatus, analysisJobs } from "#/db/schema";

type UiStatus = "pending" | "in-progress" | "complete" | "failed";

function toUiStatus(status: AnalysisStatus): UiStatus {
	if (status === "queued") return "pending";
	if (status === "running") return "in-progress";
	return status;
}

export type GameAnalysisStatus = {
	gameId: string;
	analysisJobId: string;
	status: UiStatus;
	movesAnalyzed: number;
	totalMoves: number | null;
};

export const getRecentGameAnalysisStatuses = createServerFn({ method: "GET" })
	.inputValidator(z.object({ gameIds: z.array(z.string().uuid()).min(1) }))
	.handler(async ({ data }) => {
		try {
			const jobs = await db
				.selectDistinctOn([analysisJobs.gameId], {
					gameId: analysisJobs.gameId,
					id: analysisJobs.id,
					status: analysisJobs.status,
					movesAnalyzed: analysisJobs.movesAnalyzed,
					totalMoves: analysisJobs.totalMoves,
				})
				.from(analysisJobs)
				.where(inArray(analysisJobs.gameId, data.gameIds))
				.orderBy(analysisJobs.gameId, desc(analysisJobs.enqueuedAt));

			const statuses: GameAnalysisStatus[] = jobs.map((j) => ({
				gameId: j.gameId,
				analysisJobId: j.id,
				status: toUiStatus(j.status),
				movesAnalyzed: j.movesAnalyzed,
				totalMoves: j.totalMoves ?? null,
			}));

			return { statuses };
		} catch (err) {
			console.error("[getRecentGameAnalysisStatuses] Error:", err);
			return { error: String(err) };
		}
	});
