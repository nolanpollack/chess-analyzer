import {
	doublePrecision,
	integer,
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
