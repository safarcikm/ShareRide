CREATE TABLE "email_sign_ins" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"email" text NOT NULL,
	"pending_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_sign_ins_pending_hash_unique" UNIQUE("pending_hash")
);
--> statement-breakpoint
ALTER TABLE "verification_codes" DROP CONSTRAINT "verification_codes_purpose_check";--> statement-breakpoint
CREATE INDEX "email_sign_ins_expires_at_index" ON "email_sign_ins" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "verification_codes" ADD CONSTRAINT "verification_codes_purpose_check" CHECK ("verification_codes"."purpose" in ('sign_in', 'confirm', 'console_recovery', 'email_sign_in'));