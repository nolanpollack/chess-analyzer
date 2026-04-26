/**
 * Move explanations — Phase 1 stub. Disabled until move_tags atomic schema +
 * moves table integration is complete (Phase 2). UI gracefully handles null.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type ExplanationResult = {
	explanation: {
		id: string;
		moveId: string;
		explanation: string;
		principle: string | null;
		model: string;
		promptVersion: string;
		createdAt: string;
	} | null;
	tags: {
		concepts: string[];
	} | null;
};

export const getExplanation = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			gameAnalysisId: z.string().uuid(),
			ply: z.number().int().positive(),
		}),
	)
	.handler(async ({ data: _data }): Promise<ExplanationResult> => {
		// TODO Phase 2+ — re-implement against moves + move_tags atomic rows
		return { explanation: null, tags: null };
	});
