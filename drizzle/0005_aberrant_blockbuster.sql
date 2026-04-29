DROP TABLE "dimension_score_cache" CASCADE;--> statement-breakpoint
ALTER TABLE "analysis_jobs" DROP COLUMN "weighted_accuracy_white";--> statement-breakpoint
ALTER TABLE "analysis_jobs" DROP COLUMN "weighted_accuracy_black";--> statement-breakpoint
ALTER TABLE "moves" DROP COLUMN "complexity";