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

export const gamePhaseEnum = pgEnum("game_phase", [
	"opening",
	"middlegame",
	"endgame",
]);

export const chessPieceEnum = pgEnum("chess_piece", [
	"pawn",
	"knight",
	"bishop",
	"rook",
	"queen",
	"king",
]);

export const conceptEnum = pgEnum("concept", [
	// Tactical
	"hanging-piece",
	"fork",
	"pin",
	"skewer",
	"discovered-attack",
	"back-rank",
	"overloaded-piece",
	"deflection",
	"mating-pattern",
	// Positional
	"piece-activity",
	"pawn-structure",
	"weak-square",
	"open-file",
	"bishop-pair",
	"outpost",
	"space-advantage",
	"king-safety",
	// Strategic
	"development",
	"premature-attack",
	"piece-coordination",
	"rook-activation",
	"passed-pawn",
	"prophylaxis",
	"trade-evaluation",
	// Endgame
	"king-activation",
	"opposition",
	"pawn-promotion",
	"rook-endgame",
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

// ── Move Tags (one row per analyzed move) ──────────────────────────────

export type GamePhase = "opening" | "middlegame" | "endgame";
export type ChessPiece =
	| "pawn"
	| "knight"
	| "bishop"
	| "rook"
	| "queen"
	| "king";
export type Concept =
	| "hanging-piece"
	| "fork"
	| "pin"
	| "skewer"
	| "discovered-attack"
	| "back-rank"
	| "overloaded-piece"
	| "deflection"
	| "mating-pattern"
	| "piece-activity"
	| "pawn-structure"
	| "weak-square"
	| "open-file"
	| "bishop-pair"
	| "outpost"
	| "space-advantage"
	| "king-safety"
	| "development"
	| "premature-attack"
	| "piece-coordination"
	| "rook-activation"
	| "passed-pawn"
	| "prophylaxis"
	| "trade-evaluation"
	| "king-activation"
	| "opposition"
	| "pawn-promotion"
	| "rook-endgame";

export const moveTags = pgTable(
	"move_tags",
	{
		id: uuid().primaryKey().defaultRandom(),
		gameAnalysisId: uuid("game_analysis_id")
			.references(() => gameAnalyses.id)
			.notNull(),
		playerId: uuid("player_id")
			.references(() => players.id)
			.notNull(),
		ply: integer().notNull(),
		gamePhase: gamePhaseEnum("game_phase").notNull(),
		piecesInvolved: chessPieceEnum("pieces_involved").array().notNull(),
		openingEco: text("opening_eco"),
		openingName: text("opening_name"),
		concepts: conceptEnum("concepts").array(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [unique().on(t.gameAnalysisId, t.ply)],
);

// ── Move Explanations (generated on-demand) ────────────────────────────

export const moveExplanations = pgTable(
	"move_explanations",
	{
		id: uuid().primaryKey().defaultRandom(),
		gameAnalysisId: uuid("game_analysis_id")
			.references(() => gameAnalyses.id)
			.notNull(),
		ply: integer().notNull(),
		explanation: text().notNull(),
		principle: text(),
		model: text().notNull(),
		promptVersion: text("prompt_version").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [unique().on(t.gameAnalysisId, t.ply)],
);

// ── LLM Logs ───────────────────────────────────────────────────────────

export const llmLogs = pgTable("llm_logs", {
	id: uuid().primaryKey().defaultRandom(),
	jobType: text("job_type").notNull(),
	input: jsonb().notNull(),
	output: jsonb().notNull(),
	model: text().notNull(),
	promptVersion: text("prompt_version").notNull(),
	latencyMs: integer("latency_ms").notNull(),
	tokenCountInput: integer("token_count_input"),
	tokenCountOutput: integer("token_count_output"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});
