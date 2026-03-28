CREATE TYPE "public"."chess_piece" AS ENUM('pawn', 'knight', 'bishop', 'rook', 'queen', 'king');--> statement-breakpoint
CREATE TYPE "public"."concept" AS ENUM('hanging-piece', 'fork', 'pin', 'skewer', 'discovered-attack', 'back-rank', 'overloaded-piece', 'deflection', 'mating-pattern', 'piece-activity', 'pawn-structure', 'weak-square', 'open-file', 'bishop-pair', 'outpost', 'space-advantage', 'king-safety', 'development', 'premature-attack', 'piece-coordination', 'rook-activation', 'passed-pawn', 'prophylaxis', 'trade-evaluation', 'king-activation', 'opposition', 'pawn-promotion', 'rook-endgame');--> statement-breakpoint
CREATE TYPE "public"."game_phase" AS ENUM('opening', 'middlegame', 'endgame');--> statement-breakpoint
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
	"game_analysis_id" uuid NOT NULL,
	"ply" integer NOT NULL,
	"explanation" text NOT NULL,
	"principle" text,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "move_explanations_game_analysis_id_ply_unique" UNIQUE("game_analysis_id","ply")
);
--> statement-breakpoint
CREATE TABLE "move_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_analysis_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"ply" integer NOT NULL,
	"game_phase" "game_phase" NOT NULL,
	"pieces_involved" "chess_piece"[] NOT NULL,
	"opening_eco" text,
	"opening_name" text,
	"concepts" "concept"[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "move_tags_game_analysis_id_ply_unique" UNIQUE("game_analysis_id","ply")
);
--> statement-breakpoint
ALTER TABLE "move_explanations" ADD CONSTRAINT "move_explanations_game_analysis_id_game_analyses_id_fk" FOREIGN KEY ("game_analysis_id") REFERENCES "public"."game_analyses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_tags" ADD CONSTRAINT "move_tags_game_analysis_id_game_analyses_id_fk" FOREIGN KEY ("game_analysis_id") REFERENCES "public"."game_analyses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "move_tags" ADD CONSTRAINT "move_tags_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;