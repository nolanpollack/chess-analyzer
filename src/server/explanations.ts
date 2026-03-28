/**
 * Server functions for move explanations.
 *
 * - getExplanation: fetch cached explanation + tags for a move
 * - generateExplanation: generate a new explanation via LLM (or return cached)
 */
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

// ── Zod schema for LLM response ───────────────────────────────────────

const conceptIds = getAllConceptIds();
const moveExplanationSchema = z.object({
	explanation: z.string(),
	principle: z.string(),
	concepts: z.array(z.enum(conceptIds as [string, ...string[]])),
});

// ── getExplanation ─────────────────────────────────────────────────────

export const getExplanation = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			gameAnalysisId: z.string().uuid(),
			ply: z.number().int().positive(),
		}),
	)
	.handler(async ({ data }) => {
		const { gameAnalysisId, ply } = data;

		try {
			const [explanation] = await db
				.select()
				.from(moveExplanations)
				.where(
					and(
						eq(moveExplanations.gameAnalysisId, gameAnalysisId),
						eq(moveExplanations.ply, ply),
					),
				);

			const [tags] = await db
				.select()
				.from(moveTags)
				.where(
					and(
						eq(moveTags.gameAnalysisId, gameAnalysisId),
						eq(moveTags.ply, ply),
					),
				);

			return {
				explanation: explanation
					? {
							...explanation,
							createdAt: explanation.createdAt.toISOString(),
						}
					: null,
				tags: tags
					? {
							...tags,
							createdAt: tags.createdAt.toISOString(),
						}
					: null,
			};
		} catch (err) {
			console.error("[getExplanation] Error:", err);
			return { error: "Failed to load explanation" };
		}
	});

// ── generateExplanation ────────────────────────────────────────────────

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
			// 1. Check if explanation already exists (idempotent)
			const [existing] = await db
				.select()
				.from(moveExplanations)
				.where(
					and(
						eq(moveExplanations.gameAnalysisId, gameAnalysisId),
						eq(moveExplanations.ply, ply),
					),
				);

			if (existing) {
				const [tags] = await db
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
						...existing,
						createdAt: existing.createdAt.toISOString(),
					},
					tags: tags
						? { ...tags, createdAt: tags.createdAt.toISOString() }
						: null,
				};
			}

			// 2. Load game analysis and game data
			const [analysis] = await db
				.select()
				.from(gameAnalyses)
				.where(eq(gameAnalyses.id, gameAnalysisId));

			if (!analysis) {
				return { error: "Analysis not found" };
			}

			const [game] = await db
				.select()
				.from(games)
				.where(eq(games.id, analysis.gameId));

			if (!game) {
				return { error: "Game not found" };
			}

			// 3. Find the move data for the requested ply
			const moves = analysis.moves as MoveAnalysis[];
			const move = moves.find((m) => m.ply === ply);

			if (!move) {
				return { error: `Move at ply ${ply} not found` };
			}

			// 4. Load move_tags for this ply (should exist from analyze-game)
			const [tags] = await db
				.select()
				.from(moveTags)
				.where(
					and(
						eq(moveTags.gameAnalysisId, gameAnalysisId),
						eq(moveTags.ply, ply),
					),
				);

			// 5. Build context for the prompt
			const movesBefore = moves
				.filter((m) => m.ply >= ply - 4 && m.ply < ply)
				.map((m) => ({ ply: m.ply, san: m.san }));

			const movesAfter = moves
				.filter((m) => m.ply > ply && m.ply <= ply + 3)
				.map((m) => ({ ply: m.ply, san: m.san }));

			const ctx: MoveExplanationContext = {
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
			};

			const prompt = buildMoveExplanationPrompt(ctx);

			// 6. Call LLM with logging
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

			// 7. Insert explanation
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

			// 8. Update move_tags with concepts
			if (tags && llmResult.concepts.length > 0) {
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

			// Reload tags after update
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
				explanation: inserted
					? {
							...inserted,
							createdAt: inserted.createdAt.toISOString(),
						}
					: null,
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
