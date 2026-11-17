CREATE TABLE "operator_challenges" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"challenge" text NOT NULL,
	"purpose" text NOT NULL,
	"user_id" uuid,
	"setup_link_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operator_challenges_challenge_unique" UNIQUE("challenge"),
	CONSTRAINT "operator_challenges_purpose_check" CHECK ("operator_challenges"."purpose" in ('setup', 'add', 'sign_in', 'confirm'))
);
--> statement-breakpoint
CREATE TABLE "operator_passkeys" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"transports" text[] DEFAULT '{}' NOT NULL,
	"backed_up" boolean NOT NULL,
	"name" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operator_passkeys_credential_unique" UNIQUE("credential_id")
);
--> statement-breakpoint
CREATE TABLE "operator_setup_links" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operator_setup_links_token_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "operator_sessions" ADD COLUMN "confirmed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "operator_challenges" ADD CONSTRAINT "operator_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_challenges" ADD CONSTRAINT "operator_challenges_setup_link_id_operator_setup_links_id_fk" FOREIGN KEY ("setup_link_id") REFERENCES "public"."operator_setup_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_passkeys" ADD CONSTRAINT "operator_passkeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_setup_links" ADD CONSTRAINT "operator_setup_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operator_challenges_expires_index" ON "operator_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "operator_passkeys_user_index" ON "operator_passkeys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "operator_setup_links_user_index" ON "operator_setup_links" USING btree ("user_id");