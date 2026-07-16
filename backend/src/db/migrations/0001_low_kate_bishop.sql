ALTER TABLE "accounts" ADD COLUMN "email_addr" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "last_synced_uid" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "cc_addrs_json" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "bcc_addrs_json" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "body_text" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "message_id" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "imap_uid" integer;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "is_outbound" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mail_threads" ADD COLUMN "folder" text DEFAULT 'inbox' NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_threads" ADD COLUMN "is_flagged" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_threads" ADD COLUMN "snoozed_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mail_threads" ADD COLUMN "message_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "emails_message_id_idx" ON "emails" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "emails_scheduled_at_idx" ON "emails" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "mail_threads_folder_idx" ON "mail_threads" USING btree ("folder");--> statement-breakpoint
CREATE INDEX "mail_threads_last_message_at_idx" ON "mail_threads" USING btree ("last_message_at");