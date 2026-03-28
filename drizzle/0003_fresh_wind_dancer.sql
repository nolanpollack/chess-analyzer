CREATE TABLE "game_performance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_analysis_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"overall_accuracy" double precision NOT NULL,
	"overall_avg_cp_loss" double precision NOT NULL,
	"opening_accuracy" double precision,
	"opening_avg_cp_loss" double precision,
	"opening_move_count" integer DEFAULT 0 NOT NULL,
	"middlegame_accuracy" double precision,
	"middlegame_avg_cp_loss" double precision,
	"middlegame_move_count" integer DEFAULT 0 NOT NULL,
	"endgame_accuracy" double precision,
	"endgame_avg_cp_loss" double precision,
	"endgame_move_count" integer DEFAULT 0 NOT NULL,
	"piece_stats" jsonb NOT NULL,
	"concept_stats" jsonb,
	"explained_move_count" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "game_performance_game_analysis_id_unique" UNIQUE("game_analysis_id")
);
--> statement-breakpoint
CREATE TABLE "player_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"games_analyzed" integer NOT NULL,
	"total_moves_analyzed" integer NOT NULL,
	"overall_accuracy" double precision NOT NULL,
	"overall_avg_cp_loss" double precision NOT NULL,
	"opening_accuracy" double precision,
	"middlegame_accuracy" double precision,
	"endgame_accuracy" double precision,
	"piece_stats" jsonb NOT NULL,
	"opening_stats" jsonb NOT NULL,
	"category_stats" jsonb,
	"concept_stats" jsonb,
	"recent_accuracy" double precision,
	"older_accuracy" double precision,
	"weaknesses" jsonb,
	"study_recommendations" jsonb,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "player_profile_player_id_unique" UNIQUE("player_id")
);
--> statement-breakpoint
ALTER TABLE "game_performance" ADD CONSTRAINT "game_performance_game_analysis_id_game_analyses_id_fk" FOREIGN KEY ("game_analysis_id") REFERENCES "public"."game_analyses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_performance" ADD CONSTRAINT "game_performance_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_profile" ADD CONSTRAINT "player_profile_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;