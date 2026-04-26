import {
	doublePrecision,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	real,
	text,
	timestamp,
	unique,
	uuid,
} from "drizzle-orm/pg-core";

// ── Enums (column types only — dimension taxonomy lives in code) ───────

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
	"great",
	"best",
	"excellent",
	"good",
	"inaccuracy",
	"mistake",
	"blunder",
	"miss",
]);

export const analysisStatusEnum = pgEnum("analysis_status", [
	"queued",
	"running",
	"complete",
	"failed",
]);

export const tagSourceTypeEnum = pgEnum("tag_source_type", [
	"engine_rule",
	"heuristic",
	"ml_classifier",
	"manual",
]);

// ── Enum string unions ─────────────────────────────────────────────────

export type Platform = (typeof platformEnum.enumValues)[number];
export type TimeControlClass = (typeof timeControlClassEnum.enumValues)[number];
export type PlayerColor = (typeof playerColorEnum.enumValues)[number];
export type MoveClassification =
	(typeof moveClassificationEnum.enumValues)[number];
export type AnalysisStatus = (typeof analysisStatusEnum.enumValues)[number];
export type TagSourceType = (typeof tagSourceTypeEnum.enumValues)[number];

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
		// Provider-supplied accuracy (chess.com sends this; null otherwise)
		accuracyWhite: doublePrecision("accuracy_white"),
		accuracyBlack: doublePrecision("accuracy_black"),
		fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
	},
	(t) => [unique().on(t.platform, t.platformGameId)],
);

// ── Analysis jobs (pipeline state) ─────────────────────────────────────

export const analysisJobs = pgTable(
	"analysis_jobs",
	{
		id: uuid().primaryKey().defaultRandom(),
		gameId: uuid("game_id")
			.references(() => games.id)
			.notNull(),
		status: analysisStatusEnum().notNull().default("queued"),
		engine: text().notNull(),
		depth: integer().notNull(),
		pipelineVersion: text("pipeline_version").notNull(),
		attempts: integer().notNull().default(0),
		movesAnalyzed: integer("moves_analyzed").notNull().default(0),
		totalMoves: integer("total_moves"),
		// Computed once on completion for fast listing without re-aggregating moves
		accuracyWhite: doublePrecision("accuracy_white"),
		accuracyBlack: doublePrecision("accuracy_black"),
		errorMessage: text("error_message"),
		enqueuedAt: timestamp("enqueued_at").defaultNow().notNull(),
		startedAt: timestamp("started_at"),
		completedAt: timestamp("completed_at"),
	},
	(t) => [index("analysis_jobs_game_id_idx").on(t.gameId)],
);

// ── Moves (one row per move; engine output as columns) ────────────────

export const moves = pgTable(
	"moves",
	{
		id: uuid().primaryKey().defaultRandom(),
		analysisJobId: uuid("analysis_job_id")
			.references(() => analysisJobs.id)
			.notNull(),
		gameId: uuid("game_id")
			.references(() => games.id)
			.notNull(),
		// Denormalized for query performance — scoring engine filters by player
		playerId: uuid("player_id")
			.references(() => players.id)
			.notNull(),

		ply: integer().notNull(),
		color: playerColorEnum().notNull(),
		isPlayerMove: integer("is_player_move").notNull(), // 0/1; bool stored as int for portability with array push

		san: text().notNull(),
		uci: text().notNull(),
		fenBefore: text("fen_before").notNull(),
		fenAfter: text("fen_after").notNull(),

		engineBestUci: text("engine_best_uci"),
		engineBestSan: text("engine_best_san"),
		evalBeforeCp: integer("eval_before_cp"),
		evalAfterCp: integer("eval_after_cp"),
		// Player-perspective eval delta (positive = good for the side that moved)
		evalDeltaCp: integer("eval_delta_cp"),
		// Per-move accuracy 0–100 (only meaningful for player moves; null otherwise)
		accuracyScore: doublePrecision("accuracy_score"),
		classification: moveClassificationEnum(),

		// Future: depth at which engine's best move stabilized. Null until generator added.
		depthToStability: integer("depth_to_stability"),
		// Future: clock remaining from PGN %clk
		clockRemainingMs: integer("clock_remaining_ms"),

		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		unique("moves_analysis_ply_unique").on(t.analysisJobId, t.ply),
		index("moves_game_id_idx").on(t.gameId),
		index("moves_player_id_idx").on(t.playerId),
	],
);

// ── Move tags (atomic; one row per (move, dim_type, dim_value, source)) ─

export const moveTags = pgTable(
	"move_tags",
	{
		id: uuid().primaryKey().defaultRandom(),
		moveId: uuid("move_id")
			.references(() => moves.id)
			.notNull(),
		// Denormalized for the primary scoring query pattern
		playerId: uuid("player_id")
			.references(() => players.id)
			.notNull(),
		gameId: uuid("game_id")
			.references(() => games.id)
			.notNull(),

		// Dimension taxonomy lives in src/config/dimensions.ts and is validated
		// in code at write time. Stored as text so dimensions can be added
		// without schema migrations.
		dimensionType: text("dimension_type").notNull(),
		dimensionValue: text("dimension_value").notNull(),

		source: tagSourceTypeEnum().notNull(),
		sourceVersion: text("source_version").notNull(),

		confidence: real().notNull().default(1),
		weight: real().notNull().default(1),
		weightFactors: jsonb("weight_factors"),

		metadata: jsonb(),

		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => [
		unique("move_tags_unique").on(
			t.moveId,
			t.dimensionType,
			t.dimensionValue,
			t.source,
			t.sourceVersion,
		),
		index("move_tags_player_dim_idx").on(
			t.playerId,
			t.dimensionType,
			t.dimensionValue,
		),
		index("move_tags_move_id_idx").on(t.moveId),
		index("move_tags_source_idx").on(t.source, t.sourceVersion),
	],
);

// ── Move explanations (LLM-generated, on-demand) ──────────────────────

export const moveExplanations = pgTable("move_explanations", {
	id: uuid().primaryKey().defaultRandom(),
	moveId: uuid("move_id")
		.references(() => moves.id)
		.unique()
		.notNull(),
	explanation: text().notNull(),
	principle: text(),
	model: text().notNull(),
	promptVersion: text("prompt_version").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Dimension score cache (lazy-filled, player-scoped invalidation) ────

export const dimensionScoreCache = pgTable(
	"dimension_score_cache",
	{
		id: uuid().primaryKey().defaultRandom(),
		playerId: uuid("player_id")
			.references(() => players.id)
			.notNull(),
		dimensionType: text("dimension_type").notNull(),
		dimensionValue: text("dimension_value").notNull(),
		// Opaque window identifier — e.g. "trailing_20", "all", "trailing_90d"
		windowKey: text("window_key").notNull(),

		rawScore: doublePrecision("raw_score").notNull(),
		adjustedScore: doublePrecision("adjusted_score").notNull(),
		sampleSize: integer("sample_size").notNull(),
		ratingEstimate: integer("rating_estimate"),

		computedAt: timestamp("computed_at").defaultNow().notNull(),
	},
	(t) => [
		unique("dimension_score_cache_unique").on(
			t.playerId,
			t.dimensionType,
			t.dimensionValue,
			t.windowKey,
		),
		index("dimension_score_cache_player_idx").on(t.playerId),
	],
);

// ── Code-level taxonomy types (no longer pgEnum — see src/config/dimensions.ts) ─

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

// MoveAnalysis: legacy JSONB shape used by some helpers in src/lib.
// Still produced inside the worker for downstream computations even though
// it's no longer persisted as a JSONB column — analysis output now lives in
// the `moves` table. Will likely be replaced entirely in a later phase.
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

// ── LLM logs ───────────────────────────────────────────────────────────

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
