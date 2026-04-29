import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgBoss } from "pg-boss";
import { games, players } from "#/db/schema";
import { env } from "#/env";
import { enqueueGameAnalysis } from "#/lib/enqueue-analysis";
import { createChessComProvider } from "#/providers/chess-com-provider";
import type { RawGame } from "#/providers/game-provider";

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

	// Worker creates its own DB connection (per architecture rules)
	const db = drizzle(env.DATABASE_URL);

	try {
		// 1. Determine `since` from player's lastSyncedAt
		const [player] = await db
			.select({ lastSyncedAt: players.lastSyncedAt })
			.from(players)
			.where(eq(players.id, playerId));

		if (!player) {
			throw new Error(`Player ${playerId} not found in database`);
		}

		const since = player.lastSyncedAt ?? undefined;

		// 2. Fetch games from the provider
		const provider = platform === "chess.com" ? createChessComProvider() : null;

		if (!provider) {
			throw new Error(`Unsupported platform: ${platform}`);
		}

		const rawGames = await provider.fetchRecentGames(username, {
			since,
			maxMonths: since ? undefined : 3,
		});

		console.log(
			`[sync-games] Fetched ${rawGames.length} games for ${username}`,
		);

		// 3. Upsert games and update lastSyncedAt atomically
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

		// 4. Enqueue analysis newest-first so the user sees their most recent
		// games light up on the dashboard before older ones backfill.
		if (newGames.length > 0) {
			newGames.sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime());
			for (const game of newGames) {
				await enqueueGameAnalysis(game.id);
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
	db: NodePgDatabase,
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
