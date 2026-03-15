import {
	doublePrecision,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

// ── Enums ──────────────────────────────────────────────────────────────

export const platformEnum = pgEnum("platform", ["chess.com", "lichess"]);

export const timeControlClassEnum = pgEnum("time_control_class", [
	"bullet",
	"blitz",
	"rapid",
	"classical",
	"daily",
]);

export const playerColorEnum = pgEnum("player_color", ["white", "black"]);

export const moveClassificationEnum = pgEnum("move_classification", [
	"brilliant",
	"best",
	"good",
	"inaccuracy",
	"mistake",
	"blunder",
]);

export const analysisStatusEnum = pgEnum("analysis_status", [
	"pending",
	"complete",
	"failed",
]);

// ── Tables ─────────────────────────────────────────────────────────────

export const players = pgTable("players", {
	id: uuid().primaryKey().defaultRandom(),
	username: text().unique().notNull(),
	platform: platformEnum().notNull().default("chess.com"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	lastSyncedAt: timestamp("last_synced_at"),
});

export const games = pgTable(
	"games",
	{
		id: uuid().primaryKey().defaultRandom(),
		playerId: uuid("player_id")
			.references(() => players.id)
			.notNull(),
		platform: platformEnum().notNull(),
		platformGameId: text("platform_game_id").notNull(),
		pgn: text().notNull(),
		playedAt: timestamp("played_at").notNull(),
		timeControl: text("time_control").notNull(),
		timeControlClass: timeControlClassEnum("time_control_class").notNull(),
		resultDetail: text("result_detail").notNull(),
		playerColor: playerColorEnum("player_color").notNull(),
		playerRating: integer("player_rating").notNull(),
		opponentUsername: text("opponent_username").notNull(),
		opponentRating: integer("opponent_rating").notNull(),
		openingEco: text("opening_eco"),
		openingName: text("opening_name"),
		accuracyWhite: doublePrecision("accuracy_white"),
		accuracyBlack: doublePrecision("accuracy_black"),
		fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
	},
	(t) => [unique().on(t.platform, t.platformGameId)],
);

// ── MoveAnalysis JSONB shape (not a table) ─────────────────────────────

export type MoveClassification =
	| "brilliant"
	| "best"
	| "good"
	| "inaccuracy"
	| "mistake"
	| "blunder";

export type MoveAnalysis = {
	ply: number;
	san: string;
	uci: string;
	fen_before: string;
	fen_after: string;
	eval_before: number;
	eval_after: number;
	eval_delta: number;
	best_move_uci: string;
	best_move_san: string;
	classification: MoveClassification;
	is_player_move: boolean;
};

export const gameAnalyses = pgTable("game_analyses", {
	id: uuid().primaryKey().defaultRandom(),
	gameId: uuid("game_id")
		.references(() => games.id)
		.unique()
		.notNull(),
	engine: text().notNull(),
	depth: integer().notNull(),
	accuracyWhite: doublePrecision("accuracy_white"),
	accuracyBlack: doublePrecision("accuracy_black"),
	moves: jsonb().$type<MoveAnalysis[]>().notNull(),
	status: analysisStatusEnum().notNull().default("pending"),
	movesAnalyzed: integer("moves_analyzed").notNull().default(0),
	totalMoves: integer("total_moves"),
	errorMessage: text("error_message"),
	analyzedAt: timestamp("analyzed_at"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});
