CREATE TYPE "public"."analysis_status" AS ENUM('queued', 'running', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."move_classification" AS ENUM('brilliant', 'best', 'good', 'inaccuracy', 'mistake', 'blunder');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('chess.com', 'lichess');--> statement-breakpoint
CREATE TYPE "public"."player_color" AS ENUM('white', 'black');--> statement-breakpoint
CREATE TYPE "public"."tag_source_type" AS ENUM('engine_rule', 'heuristic', 'ml_classifier', 'manual');--> statement-breakpoint
CREATE TYPE "public"."time_control_class" AS ENUM('bullet', 'blitz', 'rapid', 'classical', 'daily');--> statement-breakpoint
CREATE TABLE "analysis_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"status" "analysis_status" DEFAULT 'queued' NOT NULL,
	"engine" text NOT NULL,
	"depth" integer NOT NULL,
	"pipeline_version" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"moves_analyzed" integer DEFAULT 0 NOT NULL,
	"total_moves" integer,
	"accuracy_white" double precision,
	"accuracy_black" double precision,
	"error_message" text,
	"enqueued_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "dimension_score_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"dimension_type" text NOT NULL,
	"dimension_value" text NOT NULL,
	"window_key" text NOT NULL,
	"raw_score" double precision NOT NULL,
	"adjusted_score" double precision NOT NULL,
	"sample_size" integer NOT NULL,
	"rating_estimate" integer,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dimension_score_cache_unique" UNIQUE("player_id","dimension_type","dimension_value","window_key")
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"platform_game_id" text NOT NULL,
	"pgn" text NOT NULL,
	"played_at" timestamp NOT NULL,
	"time_control" text NOT NULL,
	"time_control_class" time_control_class NOT NULL,
	"result_detail" text NOT NULL,
	"player_color" "player_color" NOT NULL,
	"player_rating" integer NOT NULL,
	"opponent_username" text NOT NULL,
	"opponent_rating" integer NOT NULL,
	"opening_eco" text,
	"opening_name" text,
	"accuracy_white" double precision,
	"accuracy_black" double precision,
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "games_platform_platform_game_id_unique" UNIQUE("platform","platform_game_id")
);
--> statement-breakpoint
CREATE TABLE "llm_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" text NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"latency_ms" integer NOT NULL,
	"token_count_input" integer,
	"token_count_output" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "move_explanations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"move_id" uuid NOT NULL,
	"explanation" text NOT NULL,
	"principle" text,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "move_explanations_move_id_unique" UNIQUE("move_id")
);
--> statement-breakpoint
CREATE TABLE "move_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"move_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"dimension_type" text NOT NULL,
	"dimension_value" text NOT NULL,
	"source" "tag_source_type" NOT NULL,
	"source_version" text NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"weight" real DEFAULT 1 NOT NULL,
	"weight_factors" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "move_tags_unique" UNIQUE("move_id","dimension_type","dimension_value","source","source_version")
);
--> statement-breakpoint
CREATE TABLE "moves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_job_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"ply" integer NOT NULL,
	"color" "player_color" NOT NULL,
	"is_player_move" integer NOT NULL,
	"san" text NOT NULL,
	"uci" text NOT NULL,
	"fen_before" text NOT NULL,
	"fen_after" text NOT NULL,
	"engine_best_uci" text,
	"engine_best_san" text,
	"eval_before_cp" integer,
	"eval_after_cp" integer,
	"eval_delta_cp" integer,
	"accuracy_score" double precision,
	"classification" "move_classification",
	"depth_to_stability" integer,
	"clock_remaining_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "moves_analysis_ply_unique" UNIQUE("analysis_job_id","ply")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"platform" "platform" DEFAULT 'chess.com' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_synced_at" timestamp,
	CONSTRAINT "players_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_score_cache" ADD CONSTRAINT "dimension_score_cache_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_explanations" ADD CONSTRAINT "move_explanations_move_id_moves_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."moves"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_tags" ADD CONSTRAINT "move_tags_move_id_moves_id_fk" FOREIGN KEY ("move_id") REFERENCES "public"."moves"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_tags" ADD CONSTRAINT "move_tags_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_tags" ADD CONSTRAINT "move_tags_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moves" ADD CONSTRAINT "moves_analysis_job_id_analysis_jobs_id_fk" FOREIGN KEY ("analysis_job_id") REFERENCES "public"."analysis_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moves" ADD CONSTRAINT "moves_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moves" ADD CONSTRAINT "moves_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_jobs_game_id_idx" ON "analysis_jobs" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "dimension_score_cache_player_idx" ON "dimension_score_cache" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "move_tags_player_dim_idx" ON "move_tags" USING btree ("player_id","dimension_type","dimension_value");--> statement-breakpoint
CREATE INDEX "move_tags_move_id_idx" ON "move_tags" USING btree ("move_id");--> statement-breakpoint
CREATE INDEX "move_tags_source_idx" ON "move_tags" USING btree ("source","source_version");--> statement-breakpoint
CREATE INDEX "moves_game_id_idx" ON "moves" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "moves_player_id_idx" ON "moves" USING btree ("player_id");