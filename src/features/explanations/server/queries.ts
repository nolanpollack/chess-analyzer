import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { moveExplanations, moveTags } from "#/db/schema";

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
