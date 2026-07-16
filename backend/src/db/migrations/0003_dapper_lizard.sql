ALTER TABLE "events" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "timezone" text;--> statement-breakpoint
CREATE INDEX "events_end_time_idx" ON "events" USING btree ("end_time");