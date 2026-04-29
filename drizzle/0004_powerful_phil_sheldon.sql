ALTER TABLE "analysis_jobs" ADD COLUMN "maia_version" text;--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD COLUMN "maia_predicted_white" double precision;--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD COLUMN "maia_ci_low_white" double precision;--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD COLUMN "maia_ci_high_white" double precision;--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD COLUMN "maia_n_positions_white" integer;--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD COLUMN "maia_predicted_black" double precision;--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD COLUMN "maia_ci_low_black" double precision;--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD COLUMN "maia_ci_high_black" double precision;--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD COLUMN "maia_n_positions_black" integer;