ALTER TABLE "messages" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "note_hidden_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "about_hidden_at" timestamp with time zone;