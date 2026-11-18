CREATE TABLE "invite_codes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"kind" text DEFAULT 'group' NOT NULL,
	"name" text NOT NULL,
	"uses_allowed" integer NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "invite_codes_kind_check" CHECK ("invite_codes"."kind" in ('group', 'personal')),
	CONSTRAINT "invite_codes_name_check" CHECK (char_length("invite_codes"."name") between 1 and 80),
	CONSTRAINT "invite_codes_uses_check" CHECK ("invite_codes"."uses" between 0 and "invite_codes"."uses_allowed"),
	CONSTRAINT "invite_codes_uses_allowed_check" CHECK ("invite_codes"."uses_allowed" >= 1)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invite_code_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_invite_code_id_invite_codes_id_fk" FOREIGN KEY ("invite_code_id") REFERENCES "public"."invite_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "users_invite_code_id_index" ON "users" USING btree ("invite_code_id");