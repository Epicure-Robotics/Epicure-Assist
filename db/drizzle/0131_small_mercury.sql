ALTER TABLE "mailboxes_mailbox" ADD COLUMN "weekend_auto_reply_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mailboxes_mailbox" ADD COLUMN "weekend_auto_reply_message" text;--> statement-breakpoint
ALTER TABLE "mailboxes_mailbox" ADD COLUMN "holiday_auto_reply_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mailboxes_mailbox" ADD COLUMN "holiday_auto_reply_message" text;