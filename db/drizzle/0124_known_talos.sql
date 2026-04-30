-- Idempotent migration

ALTER TABLE "issue_groups"
ADD COLUMN IF NOT EXISTS "assignees" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint

ALTER TABLE "issue_groups"
ADD COLUMN IF NOT EXISTS "last_assigned_index" integer DEFAULT 0;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "job_runs_updated_at_idx"
ON "job_runs" USING btree ("updated_at");
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messages_gmail_message_id_unique'
  ) THEN
    ALTER TABLE "messages"
    ADD CONSTRAINT "messages_gmail_message_id_unique"
    UNIQUE ("gmail_message_id");
  END IF;
END$$;
--> statement-breakpoint
