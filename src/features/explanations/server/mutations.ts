/**
 * Move explanations — Phase 1 stub. Generation disabled until the move_tags
 * atomic schema lands (Phase 2). Returns an error so the UI surfaces the
 * disabled state.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ExplanationResult } from "#/features/explanations/server/queries";

export const generateExplanation = createServerFn({ method: "POST" })
	.inputValidator(
		z.object({
			gameAnalysisId: z.string().uuid(),
			ply: z.number().int().positive(),
		}),
	)
	.handler(
		async ({ data: _data }): Promise<ExplanationResult | { error: string }> => {
			return {
				error:
					"Move explanations are temporarily disabled while the ratings infrastructure is rebuilt.",
			};
		},
	);
