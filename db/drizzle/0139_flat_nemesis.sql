ALTER TABLE "faqs" ADD COLUMN "usage_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "faqs" ADD COLUMN "last_used_at" timestamp with time zone;