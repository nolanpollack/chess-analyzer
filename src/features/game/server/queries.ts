import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { gameAnalyses, gamePerformance, games } from "#/db/schema";

export const getGameWithAnalysis = createServerFn({ method: "GET" })
	.inputValidator(z.object({ gameId: z.string().uuid() }))
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

export const getAnalysisStatus = createServerFn({ method: "GET" })
	.inputValidator(z.object({ gameId: z.string().uuid() }))
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

export const getGamePerformance = createServerFn({ method: "GET" })
	.inputValidator(z.object({ gameAnalysisId: z.string().uuid() }))
	.handler(async ({ data }) => {
		const { gameAnalysisId } = data;

		try {
			const [row] = await db
				.select()
				.from(gamePerformance)
				.where(eq(gamePerformance.gameAnalysisId, gameAnalysisId));

			if (!row) {
				return { performance: null };
			}

			return {
				performance: {
					...row,
					computedAt: row.computedAt.toISOString(),
				},
			};
		} catch (err) {
			console.error("[getGamePerformance] Error:", err);
			return { error: "Failed to load game performance" };
		}
	});
