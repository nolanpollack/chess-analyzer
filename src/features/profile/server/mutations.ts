import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { players } from "#/db/schema";
import { recomputeProfile } from "#/features/profile/server/recompute";

export const refreshPlayerProfile = createServerFn({ method: "POST" })
	.inputValidator(z.object({ username: z.string().min(1) }))
	.handler(async ({ data }) => {
		const { username } = data;

		try {
			const [player] = await db
				.select()
				.from(players)
				.where(eq(players.username, username.toLowerCase().trim()));

			if (!player) {
				return { error: "Player not found" };
			}

			const result = await recomputeProfile(player.id);
			if (!result) {
				return { profile: null };
			}

			return {
				profile: {
					...result,
					computedAt: result.computedAt.toISOString(),
				},
			};
		} catch (err) {
			console.error("[refreshPlayerProfile] Error:", err);
			return { error: "Failed to refresh profile" };
		}
	});
