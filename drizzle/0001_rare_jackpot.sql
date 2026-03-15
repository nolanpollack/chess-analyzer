CREATE TYPE "public"."analysis_status" AS ENUM('pending', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "public"."move_classification" AS ENUM('brilliant', 'best', 'good', 'inaccuracy', 'mistake', 'blunder');--> statement-breakpoint
CREATE TABLE "game_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"engine" text NOT NULL,
	"depth" integer NOT NULL,
	"accuracy_white" double precision,
	"accuracy_black" double precision,
	"moves" jsonb NOT NULL,
	"status" "analysis_status" DEFAULT 'pending' NOT NULL,
	"moves_analyzed" integer DEFAULT 0 NOT NULL,
	"total_moves" integer,
	"error_message" text,
	"analyzed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "game_analyses_game_id_unique" UNIQUE("game_id")
);
--> statement-breakpoint
ALTER TABLE "game_analyses" ADD CONSTRAINT "game_analyses_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;