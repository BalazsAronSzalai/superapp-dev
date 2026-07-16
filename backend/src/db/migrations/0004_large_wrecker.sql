CREATE TABLE "note_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"content_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "content_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "is_pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "note_versions" ADD CONSTRAINT "note_versions_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_versions_note_id_idx" ON "note_versions" USING btree ("note_id");--> statement-breakpoint
CREATE UNIQUE INDEX "note_versions_note_id_version_idx" ON "note_versions" USING btree ("note_id","version");--> statement-breakpoint
CREATE INDEX "notes_updated_at_idx" ON "notes" USING btree ("updated_at");