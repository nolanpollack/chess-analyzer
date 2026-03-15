import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createChessComProvider,
	PlayerNotFoundError,
} from "./chess-com-provider";

// ── Test Fixtures ──────────────────────────────────────────────────────

function makeGame(overrides: Record<string, unknown> = {}) {
	return {
		url: "https://www.chess.com/game/live/123",
		pgn: `[Event "Live Chess"]
[Site "Chess.com"]
[ECO "B20"]

1. e4 c5 *`,
		end_time: 1700000000,
		time_control: "600",
		time_class: "rapid",
		rated: true,
		rules: "chess",
		uuid: "abc-123",
		white: {
			username: "TestPlayer",
			rating: 1200,
			result: "win",
		},
		black: {
			username: "Opponent1",
			rating: 1100,
			result: "checkmated",
		},
		accuracies: {
			white: 92.5,
			black: 85.3,
		},
		...overrides,
	};
}

const ARCHIVES_RESPONSE = {
	archives: [
		"https://api.chess.com/pub/player/testplayer/games/2023/10",
		"https://api.chess.com/pub/player/testplayer/games/2023/11",
		"https://api.chess.com/pub/player/testplayer/games/2023/12",
	],
};

// ── Tests ──────────────────────────────────────────────────────────────

describe("ChessComProvider", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.useRealTimers();
	});

	function mockFetch(handlers: Record<string, () => Response>) {
		globalThis.fetch = vi.fn((input: string | URL | Request) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.toString()
						: input.url;
			for (const [pattern, handler] of Object.entries(handlers)) {
				if (url.includes(pattern)) {
					return Promise.resolve(handler());
				}
			}
			return Promise.resolve(new Response("Not found", { status: 404 }));
		}) as typeof fetch;
	}

	it("fetches and maps games correctly", async () => {
		const game = makeGame();
		mockFetch({
			"/games/archives": () => Response.json(ARCHIVES_RESPONSE),
			"/games/2023/10": () => Response.json({ games: [] }),
			"/games/2023/11": () => Response.json({ games: [] }),
			"/games/2023/12": () => Response.json({ games: [game] }),
		});

		const provider = createChessComProvider();
		const games = await provider.fetchRecentGames("testplayer");

		expect(games).toHaveLength(1);
		expect(games[0].platformGameId).toBe("abc-123");
		expect(games[0].playerColor).toBe("white");
		expect(games[0].playerRating).toBe(1200);
		expect(games[0].opponentUsername).toBe("Opponent1");
		expect(games[0].opponentRating).toBe(1100);
		expect(games[0].resultDetail).toBe("win");
		expect(games[0].timeControlClass).toBe("rapid");
		expect(games[0].openingEco).toBe("B20");
		expect(games[0].openingName).toBe("Sicilian Defense");
		expect(games[0].accuracyWhite).toBe(92.5);
		expect(games[0].accuracyBlack).toBe(85.3);
	});

	it("filters out unrated games", async () => {
		mockFetch({
			"/games/archives": () =>
				Response.json({
					archives: [
						"https://api.chess.com/pub/player/testplayer/games/2023/12",
					],
				}),
			"/games/2023/12": () =>
				Response.json({
					games: [makeGame({ rated: false })],
				}),
		});

		const provider = createChessComProvider();
		const games = await provider.fetchRecentGames("testplayer");
		expect(games).toHaveLength(0);
	});

	it("filters out non-standard chess variants", async () => {
		mockFetch({
			"/games/archives": () =>
				Response.json({
					archives: [
						"https://api.chess.com/pub/player/testplayer/games/2023/12",
					],
				}),
			"/games/2023/12": () =>
				Response.json({
					games: [makeGame({ rules: "chess960" })],
				}),
		});

		const provider = createChessComProvider();
		const games = await provider.fetchRecentGames("testplayer");
		expect(games).toHaveLength(0);
	});

	it("detects player color case-insensitively", async () => {
		const game = makeGame({
			white: { username: "Opponent1", rating: 1100, result: "win" },
			black: {
				username: "TESTPLAYER",
				rating: 1200,
				result: "checkmated",
			},
		});

		mockFetch({
			"/games/archives": () =>
				Response.json({
					archives: [
						"https://api.chess.com/pub/player/testplayer/games/2023/12",
					],
				}),
			"/games/2023/12": () => Response.json({ games: [game] }),
		});

		const provider = createChessComProvider();
		const games = await provider.fetchRecentGames("testplayer");

		expect(games).toHaveLength(1);
		expect(games[0].playerColor).toBe("black");
		expect(games[0].resultDetail).toBe("checkmated");
		expect(games[0].playerRating).toBe(1200);
	});

	it("handles missing accuracies", async () => {
		const game = makeGame();
		delete (game as Record<string, unknown>).accuracies;

		mockFetch({
			"/games/archives": () =>
				Response.json({
					archives: [
						"https://api.chess.com/pub/player/testplayer/games/2023/12",
					],
				}),
			"/games/2023/12": () => Response.json({ games: [game] }),
		});

		const provider = createChessComProvider();
		const games = await provider.fetchRecentGames("testplayer");

		expect(games).toHaveLength(1);
		expect(games[0].accuracyWhite).toBeNull();
		expect(games[0].accuracyBlack).toBeNull();
	});

	it("throws PlayerNotFoundError on 404", async () => {
		mockFetch({
			"/games/archives": () => new Response("Not found", { status: 404 }),
		});

		const provider = createChessComProvider();
		await expect(provider.fetchRecentGames("nonexistent")).rejects.toThrow(
			PlayerNotFoundError,
		);
	});

	it("filters archives by since date", async () => {
		mockFetch({
			"/games/archives": () =>
				Response.json({
					archives: [
						"https://api.chess.com/pub/player/testplayer/games/2023/10",
						"https://api.chess.com/pub/player/testplayer/games/2023/11",
						"https://api.chess.com/pub/player/testplayer/games/2023/12",
					],
				}),
			"/games/2023/10": () => Response.json({ games: [] }),
			"/games/2023/11": () => Response.json({ games: [] }),
			"/games/2023/12": () =>
				Response.json({
					games: [
						makeGame({
							end_time: Math.floor(new Date("2023-12-15").getTime() / 1000),
						}),
					],
				}),
		});

		const provider = createChessComProvider();
		const games = await provider.fetchRecentGames("testplayer", {
			since: new Date("2023-12-01"),
		});

		// Should only fetch December archive
		const fetchedUrls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
			.calls.map((call: unknown[]) => call[0] as string);
		expect(fetchedUrls.some((u) => u.includes("/2023/10"))).toBe(false);
		expect(fetchedUrls.some((u) => u.includes("/2023/11"))).toBe(false);
		expect(fetchedUrls.some((u) => u.includes("/2023/12"))).toBe(true);
		expect(games).toHaveLength(1);
	});

	it("filters individual games by since date", async () => {
		const oldGame = makeGame({
			uuid: "old-game",
			end_time: Math.floor(new Date("2023-11-15").getTime() / 1000),
		});
		const newGame = makeGame({
			uuid: "new-game",
			end_time: Math.floor(new Date("2023-12-15").getTime() / 1000),
		});

		mockFetch({
			"/games/archives": () =>
				Response.json({
					archives: [
						"https://api.chess.com/pub/player/testplayer/games/2023/11",
						"https://api.chess.com/pub/player/testplayer/games/2023/12",
					],
				}),
			"/games/2023/11": () => Response.json({ games: [oldGame] }),
			"/games/2023/12": () => Response.json({ games: [newGame] }),
		});

		const provider = createChessComProvider();
		const games = await provider.fetchRecentGames("testplayer", {
			since: new Date("2023-12-01"),
		});

		expect(games).toHaveLength(1);
		expect(games[0].platformGameId).toBe("new-game");
	});

	it("limits archives by maxMonths", async () => {
		mockFetch({
			"/games/archives": () =>
				Response.json({
					archives: [
						"https://api.chess.com/pub/player/testplayer/games/2023/09",
						"https://api.chess.com/pub/player/testplayer/games/2023/10",
						"https://api.chess.com/pub/player/testplayer/games/2023/11",
						"https://api.chess.com/pub/player/testplayer/games/2023/12",
					],
				}),
			"/games/2023/11": () => Response.json({ games: [] }),
			"/games/2023/12": () => Response.json({ games: [makeGame()] }),
		});

		const provider = createChessComProvider();
		await provider.fetchRecentGames("testplayer", { maxMonths: 2 });

		const fetchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
			.calls;
		const fetchedUrls = fetchCalls.map((call: unknown[]) => call[0] as string);
		expect(fetchedUrls).not.toContain(expect.stringContaining("/2023/09"));
		expect(fetchedUrls).not.toContain(expect.stringContaining("/2023/10"));
	});
});
