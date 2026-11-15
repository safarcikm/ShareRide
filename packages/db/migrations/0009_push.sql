CREATE TABLE "push_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"push_token_id" uuid NOT NULL,
	"check_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_tickets" ADD CONSTRAINT "push_tickets_push_token_id_push_tokens_id_fk" FOREIGN KEY ("push_token_id") REFERENCES "public"."push_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_tickets_check_index" ON "push_tickets" USING btree ("check_at");--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_token_unique" UNIQUE("token");