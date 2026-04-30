/**
 * Analysis status queries — used to wire in-progress analysis to the profile
 * page row-level progress indicators.
 */
import { createServerFn } from "@tanstack/react-start";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { type AnalysisStatus, analysisJobs, games } from "#/db/schema";

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
	/** True once the player-side accuracy column is populated. */
	accuracyReady: boolean;
	/** True once the player-side Maia rating column is populated. */
	gameRatingReady: boolean;
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
					playerColor: games.playerColor,
					accuracyWhite: analysisJobs.accuracyWhite,
					accuracyBlack: analysisJobs.accuracyBlack,
					maiaPredictedWhite: analysisJobs.maiaPredictedWhite,
					maiaPredictedBlack: analysisJobs.maiaPredictedBlack,
				})
				.from(analysisJobs)
				.innerJoin(games, eq(games.id, analysisJobs.gameId))
				.where(inArray(analysisJobs.gameId, data.gameIds))
				.orderBy(analysisJobs.gameId, desc(analysisJobs.enqueuedAt));

			const statuses: GameAnalysisStatus[] = jobs.map((j) => ({
				gameId: j.gameId,
				analysisJobId: j.id,
				status: toUiStatus(j.status),
				movesAnalyzed: j.movesAnalyzed,
				totalMoves: j.totalMoves ?? null,
				accuracyReady:
					j.playerColor === "white"
						? j.accuracyWhite != null
						: j.accuracyBlack != null,
				gameRatingReady:
					j.playerColor === "white"
						? j.maiaPredictedWhite != null
						: j.maiaPredictedBlack != null,
			}));

			return { statuses };
		} catch (err) {
			console.error("[getRecentGameAnalysisStatuses] Error:", err);
			return { error: String(err) };
		}
	});
