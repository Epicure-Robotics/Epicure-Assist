ALTER TABLE "issue_groups" ADD COLUMN "custom_prompt" text;--> statement-breakpoint
ALTER TABLE "issue_groups" ADD COLUMN "auto_response_enabled" integer DEFAULT 0 NOT NULL;