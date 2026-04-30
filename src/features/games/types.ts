import type { PlayerColor } from "#/db/schema";
import type { listGames } from "#/features/games/server/queries";

/**
 * Three-value result bucket computed from `resultDetail`. Not stored in the
 * DB — computed via `classifyResult()` in `lib/chess-utils.ts`.
 */
export type GameResult = "win" | "loss" | "draw";
export type GameResultLetter = "W" | "L" | "D";

/**
 * Game DTO — the row shape `listGames` returns over the wire. Derived from
 * the server function's inferred return type so the shape cannot drift
 * from its sole producer. `getGame` returns the same shape (or null).
 */
type ListGamesResult = Awaited<ReturnType<typeof listGames>>;
export type Game = ListGamesResult["items"][number];

/**
 * UI projection — compact shape rendered by RecentGamesCard and similar
 * condensed displays. This is a view model constructed at render time,
 * not a wire DTO, so it is defined manually here.
 */
export type GameSummary = {
	id: string;
	opp: string;
	oppElo: number | null;
	result: GameResultLetter;
	color: PlayerColor;
	rating: number | null;
	acc: number | null;
	time: string;
	opening: string;
	when: string;
};
