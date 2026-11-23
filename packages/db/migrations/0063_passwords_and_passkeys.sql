CREATE TABLE "member_passkey_challenges" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"challenge" text NOT NULL,
	"purpose" text NOT NULL,
	"user_id" uuid,
	"user_handle" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_passkey_challenges_challenge_unique" UNIQUE("challenge"),
	CONSTRAINT "member_passkey_challenges_purpose_check" CHECK ("member_passkey_challenges"."purpose" in ('sign_in', 'register'))
);
--> statement-breakpoint
CREATE TABLE "member_passkeys" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"transports" text[] DEFAULT '{}' NOT NULL,
	"backed_up" boolean NOT NULL,
	"user_handle" text NOT NULL,
	"browser" text,
	"system" text,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_passkeys_credential_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "member_passwords" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"hash" text NOT NULL,
	"set_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_passkey_challenges" ADD CONSTRAINT "member_passkey_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_passkeys" ADD CONSTRAINT "member_passkeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_passwords" ADD CONSTRAINT "member_passwords_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_passkey_challenges_expires_index" ON "member_passkey_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "member_passkeys_user_index" ON "member_passkeys" USING btree ("user_id");