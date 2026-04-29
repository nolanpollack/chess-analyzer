CREATE TABLE "maia_cache" (
	"fen" text NOT NULL,
	"maia_version" text NOT NULL,
	"output_blob" "bytea" NOT NULL,
	"move_index" jsonb NOT NULL,
	"rating_grid" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "maia_cache_pkey" PRIMARY KEY("fen","maia_version")
);
--> statement-breakpoint
CREATE TABLE "stockfish_cache" (
	"fen" text NOT NULL,
	"stockfish_version" text NOT NULL,
	"stockfish_depth" integer NOT NULL,
	"eval_cp" integer,
	"eval_mate" integer,
	"top_moves" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stockfish_cache_pkey" PRIMARY KEY("fen","stockfish_version","stockfish_depth")
);
