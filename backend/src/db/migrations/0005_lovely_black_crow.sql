CREATE TABLE "finance_cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"finance_account_id" uuid NOT NULL,
	"label" text NOT NULL,
	"last4" text NOT NULL,
	"expiry_month" integer NOT NULL,
	"expiry_year" integer NOT NULL,
	"is_frozen" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD COLUMN "type" text DEFAULT 'checking' NOT NULL;--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "finance_accounts" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "is_recurring" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "finance_cards" ADD CONSTRAINT "finance_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_cards" ADD CONSTRAINT "finance_cards_finance_account_id_finance_accounts_id_fk" FOREIGN KEY ("finance_account_id") REFERENCES "public"."finance_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_cards_user_id_idx" ON "finance_cards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_merchant_idx" ON "transactions" USING btree ("merchant");