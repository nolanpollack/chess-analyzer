import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { players } from "#/db/schema";
import { db } from "#/db/index";
import { eq } from "drizzle-orm";
import { ensureQueue, getBoss } from "#/lib/queue";
import {
  SYNC_GAMES_QUEUE,
  type SyncGamesPayload,
} from "#/worker/jobs/sync-games";

export const getPlayerStatus = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      username: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const { username } = data;

    try {
      const [player] = await db
        .select()
        .from(players)
        .where(eq(players.username, username.toLowerCase().trim()));

      if (!player) {
        return { found: false as const };
      }

      // Determine sync status:
      // - If lastSyncedAt is null, initial sync hasn't completed yet
      // - Otherwise check for queued/active jobs via findJobs
      let isSyncing = player.lastSyncedAt === null;

      if (!isSyncing) {
        await ensureQueue(SYNC_GAMES_QUEUE);
        const boss = await getBoss();
        const pendingJobs = await boss.findJobs<SyncGamesPayload>(
          SYNC_GAMES_QUEUE,
          {
            queued: true,
            data: { playerId: player.id },
          },
        );
        isSyncing = pendingJobs.length > 0;
      }

      return {
        found: true as const,
        player: {
          id: player.id,
          username: player.username,
          lastSyncedAt: player.lastSyncedAt?.toISOString() ?? null,
        },
        isSyncing,
      };
    } catch (err) {
      console.error("[getPlayerStatus] Error:", err);
      return { error: "Failed to get player status" };
    }
  });
