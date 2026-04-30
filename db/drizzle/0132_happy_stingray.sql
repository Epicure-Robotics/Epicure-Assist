ALTER TABLE "messages" ADD COLUMN "draft_author_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "draft_edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "draft_version" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_messages_staff_drafts" ON "messages" USING btree ("conversation_id","status","draft_edited_at") WHERE ("messages"."deleted_at" is null and "messages"."status" = 'staff_draft');