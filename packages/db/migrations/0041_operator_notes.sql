CREATE TABLE "operator_notes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"text" text NOT NULL,
	"by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operator_notes_text_check" CHECK (char_length("operator_notes"."text") between 1 and 4000)
);
--> statement-breakpoint
ALTER TABLE "operator_notes" ADD CONSTRAINT "operator_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_notes" ADD CONSTRAINT "operator_notes_by_id_users_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operator_notes_user_index" ON "operator_notes" USING btree ("user_id","created_at");