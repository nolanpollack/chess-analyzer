/**
 * Game queries — Phase 1 stub.
 *
 * `gameAnalyses` is replaced by `analysisJobs` (multiple jobs allowed per
 * game). Per-game performance precomputation is gone — Phase 3 computes it
 * on-read from the scoring engine.
 */
import { createServerFn } from "@tanstack/react-start";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import {
	type AnalysisStatus,
	analysisJobs,
	games,
	type MoveAnalysis,
	moves,
} from "#/db/schema";

type UiAnalysisStatus = "pending" | "complete" | "failed";

function toUiStatus(status: AnalysisStatus): UiAnalysisStatus {
	if (status === "queued" || status === "running") return "pending";
	return status;
}

async function getLatestJob(gameId: string) {
	const [job] = await db
		.select()
		.from(analysisJobs)
		.where(eq(analysisJobs.gameId, gameId))
		.orderBy(desc(analysisJobs.enqueuedAt))
		.limit(1);
	return job ?? null;
}

export const getGameWithAnalysis = createServerFn({ method: "GET" })
	.inputValidator(z.object({ gameId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const { gameId } = data;

		try {
			const [game] = await db.select().from(games).where(eq(games.id, gameId));

			if (!game) {
				return { game: null, analysis: null };
			}

			const job = await getLatestJob(gameId);

			let moveRows: MoveAnalysis[] = [];
			if (job) {
				const rows = await db
					.select()
					.from(moves)
					.where(eq(moves.analysisJobId, job.id))
					.orderBy(moves.ply);
				moveRows = rows.map(toMoveAnalysis);
			}

			return {
				game: {
					...game,
					playedAt: game.playedAt.toISOString(),
					fetchedAt: game.fetchedAt.toISOString(),
				},
				analysis: job
					? {
							id: job.id,
							status: toUiStatus(job.status),
							rawStatus: job.status,
							engine: job.engine,
							depth: job.depth,
							accuracyWhite: job.accuracyWhite,
							accuracyBlack: job.accuracyBlack,
							movesAnalyzed: job.movesAnalyzed,
							totalMoves: job.totalMoves,
							errorMessage: job.errorMessage,
							moves: moveRows,
							analyzedAt: job.completedAt?.toISOString() ?? null,
							createdAt: job.enqueuedAt.toISOString(),
						}
					: null,
			};
		} catch (err) {
			console.error("[getGameWithAnalysis] Error:", err);
			return { error: "Failed to load analysis" };
		}
	});

export const getAnalysisStatus = createServerFn({ method: "GET" })
	.inputValidator(z.object({ gameId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const { gameId } = data;

		try {
			const job = await getLatestJob(gameId);

			if (!job) {
				return {
					status: null as null,
					movesAnalyzed: 0,
					totalMoves: null,
					error: undefined,
				};
			}

			return {
				status: toUiStatus(job.status),
				movesAnalyzed: job.movesAnalyzed,
				totalMoves: job.totalMoves,
				error: job.errorMessage ?? undefined,
			};
		} catch (err) {
			console.error("[getAnalysisStatus] Error:", err);
			return { error: "Failed to get analysis status" };
		}
	});

// Shape consumers (FactorBreakdownCard, route gameId page) deconstruct.
// Phase 3 fills this from the scoring engine; for now it's always null.
export type GamePerformance = {
	overallAccuracy: number;
	openingAccuracy: number | null;
	openingMoveCount: number;
	middlegameAccuracy: number | null;
	middlegameMoveCount: number;
	endgameAccuracy: number | null;
	endgameMoveCount: number;
	pieceStats: Record<
		"pawn" | "knight" | "bishop" | "rook" | "queen" | "king",
		{ accuracy: number; avgCpLoss: number; moveCount: number }
	>;
};

export const getGamePerformance = createServerFn({ method: "GET" })
	.inputValidator(z.object({ gameAnalysisId: z.string().uuid() }))
	.handler(
		async ({
			data: _data,
		}): Promise<{ performance: GamePerformance | null }> => {
			// TODO Phase 3 — compute on-demand from scoring engine over moves rows
			// for this analysis job, then map dimensional scores to the
			// per-phase / per-piece breakdown the UI expects.
			return { performance: null };
		},
	);

function toMoveAnalysis(row: typeof moves.$inferSelect): MoveAnalysis {
	return {
		ply: row.ply,
		san: row.san,
		uci: row.uci,
		fen_before: row.fenBefore,
		fen_after: row.fenAfter,
		eval_before: row.evalBeforeCp ?? 0,
		eval_after: row.evalAfterCp ?? 0,
		eval_delta: row.evalDeltaCp ?? 0,
		best_move_uci: row.engineBestUci ?? "",
		best_move_san: row.engineBestSan ?? "",
		classification: row.classification ?? "good",
		is_player_move: row.isPlayerMove === 1,
	};
}
