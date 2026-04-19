import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "#/db/index";
import { players } from "#/db/schema";
import { ensureQueue, getBoss } from "#/lib/queue";
import {
  SYNC_GAMES_QUEUE,
  type SyncGamesPayload,
} from "#/worker/jobs/sync-games";

export const syncPlayer = createServerFn({ method: "POST" })
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

      await enqueueSyncJob(player.id, player.username, player.platform);
      return { enqueued: true };
    } catch (err) {
      console.error("[syncPlayer] Error:", err);
      return { error: "Failed to sync player" };
    }
  });

async function enqueueSyncJob(
  playerId: string,
  username: string,
  platform: "chess.com" | "lichess",
) {
  await ensureQueue(SYNC_GAMES_QUEUE);
  const boss = await getBoss();
  await boss.send(SYNC_GAMES_QUEUE, {
    playerId,
    username,
    platform,
  } satisfies SyncGamesPayload);
}
