import { parseOpeningFromPgn } from "#/lib/chess-utils";
import type { FetchGamesOptions, GameProvider, RawGame } from "./game-provider";

// ── Error Types ────────────────────────────────────────────────────────

export class PlayerNotFoundError extends Error {
	constructor(username: string) {
		super(`Player "${username}" not found on chess.com`);
		this.name = "PlayerNotFoundError";
	}
}

// ── Chess.com API Types ────────────────────────────────────────────────

type ChessComPlayer = {
	username: string;
	rating: number;
	result: string;
};

type ChessComGame = {
	url: string;
	pgn: string;
	end_time: number;
	time_control: string;
	time_class: "bullet" | "blitz" | "rapid" | "daily";
	rated: boolean;
	rules: string;
	uuid: string;
	white: ChessComPlayer;
	black: ChessComPlayer;
	accuracies?: {
		white: number;
		black: number;
	};
};

type ChessComArchivesResponse = {
	archives: string[];
};

type ChessComGamesResponse = {
	games: ChessComGame[];
};

// ── Fetch Helpers ──────────────────────────────────────────────────────

const USER_AGENT = "ChessAnalyzer/1.0 (github.com/nolanpollack/chess-analyzer)";
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000;

async function fetchWithRetry(url: string): Promise<Response> {
	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		const response = await fetch(url, {
			headers: { "User-Agent": USER_AGENT },
		});

		if (response.status === 429 && attempt < MAX_RETRIES) {
			const backoff = INITIAL_BACKOFF_MS * 2 ** attempt;
			console.warn(
				`[chess.com] Rate limited on ${url}, retrying in ${backoff}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
			);
			await new Promise((resolve) => setTimeout(resolve, backoff));
			continue;
		}

		return response;
	}

	// Unreachable, but TypeScript needs it
	throw new Error(
		`[chess.com] Failed to fetch ${url} after ${MAX_RETRIES} retries`,
	);
}

// ── Archive URL Filtering ──────────────────────────────────────────────

function filterArchiveUrls(archives: string[], maxMonths: number): string[] {
	return archives.slice(-maxMonths);
}

// ── Game Mapping ───────────────────────────────────────────────────────

function mapGame(game: ChessComGame, username: string): RawGame | null {
	const isWhite = game.white.username.toLowerCase() === username.toLowerCase();
	const playerSide = isWhite ? game.white : game.black;
	const opponentSide = isWhite ? game.black : game.white;

	const opening = parseOpeningFromPgn(game.pgn);

	return {
		platformGameId: game.uuid,
		pgn: game.pgn,
		playedAt: new Date(game.end_time * 1000),
		timeControl: game.time_control,
		timeControlClass: game.time_class,
		resultDetail: playerSide.result,
		playerColor: isWhite ? "white" : "black",
		playerRating: playerSide.rating,
		opponentUsername: opponentSide.username,
		opponentRating: opponentSide.rating,
		openingEco: opening.eco,
		openingName: opening.name,
		accuracyWhite: game.accuracies?.white ?? null,
		accuracyBlack: game.accuracies?.black ?? null,
	};
}

// ── Provider Implementation ────────────────────────────────────────────

export function createChessComProvider(): GameProvider {
	return {
		async fetchRecentGames(
			username: string,
			options?: FetchGamesOptions,
		): Promise<RawGame[]> {
			// 1. Get archive list
			const archivesRes = await fetchWithRetry(
				`https://api.chess.com/pub/player/${username}/games/archives`,
			);

			if (archivesRes.status === 404) {
				throw new PlayerNotFoundError(username);
			}

			if (!archivesRes.ok) {
				throw new Error(
					`[chess.com] Failed to fetch archives for ${username}: ${archivesRes.status}`,
				);
			}

			const archivesData =
				(await archivesRes.json()) as ChessComArchivesResponse;
			const archiveUrls = filterArchiveUrls(
				archivesData.archives,
				options?.maxMonths ?? 3,
			);

			// 2. Fetch each month sequentially (chess.com rate limits parallel)
			const allGames: RawGame[] = [];
			let skipped = 0;

			for (const url of archiveUrls) {
				const monthRes = await fetchWithRetry(url);

				if (monthRes.status === 404) {
					// chess.com lists archive URLs before data is available; skip gracefully
					continue;
				}

				if (!monthRes.ok) {
					throw new Error(
						`[chess.com] Failed to fetch archive ${url}: HTTP ${monthRes.status}`,
					);
				}

				const monthData = (await monthRes.json()) as ChessComGamesResponse;

				for (const game of monthData.games) {
					// Filter: only standard chess, only rated
					if (game.rules !== "chess" || !game.rated) {
						continue;
					}

					try {
						const mapped = mapGame(game, username);
						if (mapped) {
							allGames.push(mapped);
						}
					} catch (err) {
						skipped++;
						console.warn(
							`[chess.com] Skipping malformed game ${game.uuid}:`,
							err,
						);
					}
				}
			}

			if (skipped > 0) {
				console.warn(
					`[chess.com] Skipped ${skipped} malformed games for ${username}`,
				);
			}

			return allGames;
		},
	};
}

/**
 * Verify a username exists on chess.com.
 * Returns true if the player exists, false if 404.
 * Throws on other errors.
 */
export async function verifyChessComPlayer(username: string): Promise<boolean> {
	const res = await fetchWithRetry(
		`https://api.chess.com/pub/player/${username}`,
	);

	if (res.status === 404) {
		return false;
	}

	if (!res.ok) {
		throw new Error(
			`[chess.com] Failed to verify player ${username}: ${res.status}`,
		);
	}

	return true;
}
