ALTER TABLE "faqs" ADD COLUMN "source_conversation_id" bigint;--> statement-breakpoint
ALTER TABLE "faqs" ADD CONSTRAINT "faqs_source_conversation_id_key" UNIQUE("source_conversation_id");