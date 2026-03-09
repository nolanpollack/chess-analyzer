CREATE TYPE "public"."platform" AS ENUM('chess.com', 'lichess');--> statement-breakpoint
CREATE TYPE "public"."player_color" AS ENUM('white', 'black');--> statement-breakpoint
CREATE TYPE "public"."time_control_class" AS ENUM('bullet', 'blitz', 'rapid', 'classical', 'daily');--> statement-breakpoint
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
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"platform" "platform" DEFAULT 'chess.com' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_synced_at" timestamp,
	CONSTRAINT "players_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;