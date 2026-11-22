CREATE TABLE "identities" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"email" text,
	"linked_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identities_provider_subject_unique" UNIQUE("provider","subject"),
	CONSTRAINT "identities_user_provider_unique" UNIQUE("user_id","provider"),
	CONSTRAINT "identities_provider_check" CHECK ("identities"."provider" in ('google', 'apple'))
);
--> statement-breakpoint
CREATE TABLE "provider_sign_ins" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"provider" text NOT NULL,
	"state_hash" text NOT NULL,
	"challenge" text NOT NULL,
	"return_url" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"answered_at" timestamp with time zone,
	"subject" text,
	"email" text,
	"first_name" text,
	"ticket_hash" text,
	"ticket_expires_at" timestamp with time zone,
	"ticket_used_at" timestamp with time zone,
	"pending_hash" text,
	"link_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_sign_ins_state_hash_unique" UNIQUE("state_hash"),
	CONSTRAINT "provider_sign_ins_ticket_hash_unique" UNIQUE("ticket_hash"),
	CONSTRAINT "provider_sign_ins_pending_hash_unique" UNIQUE("pending_hash"),
	CONSTRAINT "provider_sign_ins_provider_check" CHECK ("provider_sign_ins"."provider" in ('google', 'apple'))
);
--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_sign_ins" ADD CONSTRAINT "provider_sign_ins_link_user_id_users_id_fk" FOREIGN KEY ("link_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_sign_ins_expires_at_index" ON "provider_sign_ins" USING btree ("expires_at");