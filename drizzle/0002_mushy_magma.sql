ALTER TABLE "analysis_jobs" ADD COLUMN "weighted_accuracy_white" double precision;--> statement-breakpoint
ALTER TABLE "analysis_jobs" ADD COLUMN "weighted_accuracy_black" double precision;--> statement-breakpoint
ALTER TABLE "moves" ADD COLUMN "complexity" double precision;