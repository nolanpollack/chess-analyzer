import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PgBoss } from "pg-boss";
import type * as schema from "#/db/schema";
import { games, players } from "#/db/schema";
import { createAndEnqueueAnalysis } from "#/lib/enqueue-analysis";
import { createChessComProvider } from "#/providers/chess-com-provider";
import type { RawGame } from "#/providers/game-provider";
import { getWorkerDb } from "#/worker/db";

// ── Job Types ──────────────────────────────────────────────────────────

export const SYNC_GAMES_QUEUE = "sync-games";

export type SyncGamesPayload = {
	playerId: string;
	username: string;
	platform: "chess.com" | "lichess";
};

// ── Job Handler ────────────────────────────────────────────────────────

export function registerSyncGamesJob(boss: PgBoss) {
	boss.work<SyncGamesPayload>(
		SYNC_GAMES_QUEUE,
		{ pollingIntervalSeconds: 2 },
		async (jobs) => {
			for (const job of jobs) {
				await handleSyncGames(job.data);
			}
		},
	);
}

async function handleSyncGames(data: SyncGamesPayload) {
	const { playerId, username, platform } = data;
	console.log(`[sync-games] Starting sync for ${username} (${platform})`);

	const db = getWorkerDb();

	try {
		// 1. Fetch games from the provider
		const provider = platform === "chess.com" ? createChessComProvider() : null;

		if (!provider) {
			throw new Error(`Unsupported platform: ${platform}`);
		}

		const rawGames = await provider.fetchRecentGames(username, {
			maxMonths: 3,
		});

		console.log(
			`[sync-games] Fetched ${rawGames.length} games for ${username}`,
		);

		// 2. Upsert games and update lastSyncedAt atomically
		let inserted = 0;
		const newGames: { id: string; playedAt: Date }[] = [];
		await db.transaction(async (tx) => {
			for (const raw of rawGames) {
				const result = await upsertGame(tx, raw, playerId, platform);
				if (result) {
					inserted++;
					newGames.push({ id: result, playedAt: raw.playedAt });
				}
			}
			await tx
				.update(players)
				.set({ lastSyncedAt: new Date() })
				.where(eq(players.id, playerId));
		});

		// 3. Enqueue analysis newest-first so the user sees their most recent
		// games light up on the dashboard before older ones backfill.
		if (newGames.length > 0) {
			newGames.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
			for (const game of newGames) {
				await createAndEnqueueAnalysis(db, game.id);
			}
			console.log(
				`[sync-games] Enqueued analysis for ${newGames.length} new games (newest first)`,
			);
		}

		console.log(
			`[sync-games] Completed sync for ${username}: ${inserted} new games (${rawGames.length - inserted} duplicates skipped)`,
		);
	} catch (err) {
		console.error(`[sync-games] Failed for ${username}:`, err);
		throw err; // pg-boss will retry
	}
}

// ── Helpers ────────────────────────────────────────────────────────────

async function upsertGame(
	db: NodePgDatabase<typeof schema>,
	raw: RawGame,
	playerId: string,
	platform: "chess.com" | "lichess",
): Promise<string | null> {
	const result = await db
		.insert(games)
		.values({
			playerId,
			platform,
			platformGameId: raw.platformGameId,
			pgn: raw.pgn,
			playedAt: raw.playedAt,
			timeControl: raw.timeControl,
			timeControlClass: raw.timeControlClass,
			resultDetail: raw.resultDetail,
			playerColor: raw.playerColor,
			playerRating: raw.playerRating,
			opponentUsername: raw.opponentUsername,
			opponentRating: raw.opponentRating,
			openingEco: raw.openingEco,
			openingName: raw.openingName,
			accuracyWhite: raw.accuracyWhite,
			accuracyBlack: raw.accuracyBlack,
		})
		.onConflictDoNothing({
			target: [games.platform, games.platformGameId],
		})
		.returning({ id: games.id });

	return result.length > 0 ? result[0].id : null;
}
