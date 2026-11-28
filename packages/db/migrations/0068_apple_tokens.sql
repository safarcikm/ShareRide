CREATE TABLE "apple_tokens_to_revoke" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"token" text NOT NULL,
	"revoke_after" timestamp with time zone NOT NULL,
	"queued_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identities" ADD COLUMN "apple_refresh_token" text;--> statement-breakpoint
ALTER TABLE "provider_sign_ins" ADD COLUMN "apple_refresh_token" text;--> statement-breakpoint
CREATE INDEX "apple_tokens_to_revoke_revoke_after_index" ON "apple_tokens_to_revoke" USING btree ("revoke_after");--> statement-breakpoint
CREATE INDEX "apple_tokens_to_revoke_queued_at_index" ON "apple_tokens_to_revoke" USING btree ("queued_at");