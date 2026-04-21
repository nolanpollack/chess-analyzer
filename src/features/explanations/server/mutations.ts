import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getAllConceptIds } from "#/config/concepts";
import { getLLMModel, LLM_CONFIG } from "#/config/llm";
import { db } from "#/db/index";
import {
	type Concept,
	gameAnalyses,
	games,
	type MoveAnalysis,
	moveExplanations,
	moveTags,
} from "#/db/schema";
import { callLLMWithLogging } from "#/lib/llm";
import {
	buildMoveExplanationPrompt,
	type MoveExplanationContext,
	PROMPT_VERSION,
} from "#/prompts/move-explanation";

const conceptIds = getAllConceptIds();
const moveExplanationSchema = z.object({
	explanation: z.string(),
	principle: z.string(),
	concepts: z.array(z.enum(conceptIds as [string, ...string[]])),
});

export const generateExplanation = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			gameAnalysisId: z.string().uuid(),
			ply: z.number().int().positive(),
		}),
	)
	.handler(async ({ data }) => {
		const { gameAnalysisId, ply } = data;

		try {
			// Idempotent: return cached if exists
			const cached = await loadCachedExplanation(gameAnalysisId, ply);
			if (cached) return cached;

			const ctx = await loadExplanationContext(gameAnalysisId, ply);
			if ("error" in ctx) return ctx;

			const prompt = buildMoveExplanationPrompt(ctx.context);

			const { result: llmResult } = await callLLMWithLogging({
				jobType: "move-explanation",
				model: LLM_CONFIG.model,
				promptVersion: PROMPT_VERSION,
				input: { gameAnalysisId, ply, prompt },
				fn: async () => {
					const { object } = await generateObject({
						model: getLLMModel(),
						schema: moveExplanationSchema,
						prompt,
					});
					return object;
				},
			});

			const [inserted] = await db
				.insert(moveExplanations)
				.values({
					gameAnalysisId,
					ply,
					explanation: llmResult.explanation,
					principle: llmResult.principle,
					model: LLM_CONFIG.model,
					promptVersion: PROMPT_VERSION,
				})
				.returning();

			if (ctx.hasTags && llmResult.concepts.length > 0) {
				await db
					.update(moveTags)
					.set({ concepts: llmResult.concepts as Concept[] })
					.where(
						and(
							eq(moveTags.gameAnalysisId, gameAnalysisId),
							eq(moveTags.ply, ply),
						),
					);
			}

			const [updatedTags] = await db
				.select()
				.from(moveTags)
				.where(
					and(
						eq(moveTags.gameAnalysisId, gameAnalysisId),
						eq(moveTags.ply, ply),
					),
				);

			return {
				explanation: {
					...inserted,
					createdAt: inserted.createdAt.toISOString(),
				},
				tags: updatedTags
					? {
							...updatedTags,
							createdAt: updatedTags.createdAt.toISOString(),
						}
					: null,
			};
		} catch (err) {
			console.error("[generateExplanation] Error:", err);
			return { error: "Failed to generate explanation" };
		}
	});

async function loadCachedExplanation(gameAnalysisId: string, ply: number) {
	const [existing] = await db
		.select()
		.from(moveExplanations)
		.where(
			and(
				eq(moveExplanations.gameAnalysisId, gameAnalysisId),
				eq(moveExplanations.ply, ply),
			),
		);

	if (!existing) return null;

	const [tags] = await db
		.select()
		.from(moveTags)
		.where(
			and(eq(moveTags.gameAnalysisId, gameAnalysisId), eq(moveTags.ply, ply)),
		);

	return {
		explanation: { ...existing, createdAt: existing.createdAt.toISOString() },
		tags: tags ? { ...tags, createdAt: tags.createdAt.toISOString() } : null,
	};
}

async function loadExplanationContext(
	gameAnalysisId: string,
	ply: number,
): Promise<
	{ error: string } | { context: MoveExplanationContext; hasTags: boolean }
> {
	const [analysis] = await db
		.select()
		.from(gameAnalyses)
		.where(eq(gameAnalyses.id, gameAnalysisId));

	if (!analysis) return { error: "Analysis not found" };

	const [game] = await db
		.select()
		.from(games)
		.where(eq(games.id, analysis.gameId));

	if (!game) return { error: "Game not found" };

	const moves = analysis.moves as MoveAnalysis[];
	const move = moves.find((m) => m.ply === ply);
	if (!move) return { error: `Move at ply ${ply} not found` };

	const [tags] = await db
		.select()
		.from(moveTags)
		.where(
			and(eq(moveTags.gameAnalysisId, gameAnalysisId), eq(moveTags.ply, ply)),
		);

	const movesBefore = moves
		.filter((m) => m.ply >= ply - 4 && m.ply < ply)
		.map((m) => ({ ply: m.ply, san: m.san }));

	const movesAfter = moves
		.filter((m) => m.ply > ply && m.ply <= ply + 3)
		.map((m) => ({ ply: m.ply, san: m.san }));

	return {
		context: {
			playerRating: game.playerRating,
			playerColor: game.playerColor,
			gamePhase: tags?.gamePhase ?? "middlegame",
			fenBefore: move.fen_before,
			movePlayed: move.san,
			bestMove: move.best_move_san,
			evalBefore: move.eval_before,
			evalAfter: move.eval_after,
			evalDelta: move.eval_delta,
			classification: move.classification,
			isPlayerMove: move.is_player_move,
			movesBefore,
			movesAfter,
		},
		hasTags: !!tags,
	};
}
