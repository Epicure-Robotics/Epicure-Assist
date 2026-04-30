ALTER TABLE "issue_groups" ADD COLUMN "assignees" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "issue_groups" ADD COLUMN "last_assigned_index" integer DEFAULT 0;--> statement-breakpoint
CREATE INDEX "job_runs_updated_at_idx" ON "job_runs" USING btree ("updated_at");