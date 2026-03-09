/**
 * Provider interface for fetching games from chess platforms.
 * Implement this for each platform (chess.com, lichess, etc.).
 */

export type RawGame = {
	platformGameId: string;
	pgn: string;
	playedAt: Date;
	timeControl: string;
	timeControlClass: "bullet" | "blitz" | "rapid" | "classical" | "daily";
	resultDetail: string;
	playerColor: "white" | "black";
	playerRating: number;
	opponentUsername: string;
	opponentRating: number;
	openingEco: string | null;
	openingName: string | null;
	accuracyWhite: number | null;
	accuracyBlack: number | null;
};

export type FetchGamesOptions = {
	/** Only fetch games after this date */
	since?: Date;
	/** How many months back to look (default: 3) */
	maxMonths?: number;
};

export type GameProvider = {
	fetchRecentGames(
		username: string,
		options?: FetchGamesOptions,
	): Promise<RawGame[]>;
};
