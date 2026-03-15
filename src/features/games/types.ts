import type { listGames } from "#/server/games";
import type { getPlayerStatus } from "#/server/players";

type ListGamesResult = Awaited<ReturnType<typeof listGames>>;
export type GamesResult = ListGamesResult;
export type Game = ListGamesResult["games"][number];

type PlayerStatusResult = Awaited<ReturnType<typeof getPlayerStatus>>;
export type PlayerFound = Extract<PlayerStatusResult, { found: true }>;

export type TimeControlFilter =
	| "bullet"
	| "blitz"
	| "rapid"
	| "classical"
	| "daily";
export type ResultFilter = "win" | "loss" | "draw";
export type ColorFilter = "white" | "black";

export type GameFilters = {
	timeControlClass: TimeControlFilter | undefined;
	result: ResultFilter | undefined;
	playerColor: ColorFilter | undefined;
	page: number;
};
