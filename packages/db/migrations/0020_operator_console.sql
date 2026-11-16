CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"operator_user_id" uuid NOT NULL,
	"operator_session_id" uuid,
	"action" text NOT NULL,
	"subject_type" text,
	"subject_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_action_check" CHECK ("audit_log"."action" ~ '^[a-z][a-z_]*(\.[a-z][a-z_]*)+$')
);
--> statement-breakpoint
CREATE TABLE "operator_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"device" text,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operator_sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "operator_sessions_end_reason_check" CHECK ("operator_sessions"."end_reason" is null or "operator_sessions"."end_reason" in ('signed_out', 'idle', 'expired', 'role_removed', 'suspended'))
);
--> statement-breakpoint
ALTER TABLE "operator_sessions" ADD CONSTRAINT "operator_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_created_index" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_subject_index" ON "audit_log" USING btree ("subject_type","subject_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_action_index" ON "audit_log" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_operator_index" ON "audit_log" USING btree ("operator_user_id","created_at");--> statement-breakpoint
CREATE INDEX "operator_sessions_user_index" ON "operator_sessions" USING btree ("user_id");--> statement-breakpoint
-- The audit log is append-only (spec 9, 3.8; ADR 0028). Written by hand,
-- because drizzle-kit does not model triggers: keep this part when the
-- migration is generated again. Each entry gets the database's own time,
-- so no caller can backdate one; no entry can be updated or the table
-- emptied; and an entry can be deleted only once it is older than 3
-- years, its retention (spec 9, section 7).
CREATE FUNCTION "audit_log_stamp"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	NEW.created_at := now();
	NEW.updated_at := NEW.created_at;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "audit_log_stamp" BEFORE INSERT ON "audit_log" FOR EACH ROW EXECUTE FUNCTION "audit_log_stamp"();--> statement-breakpoint
CREATE FUNCTION "audit_log_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' AND OLD.created_at < now() - interval '3 years' THEN
		RETURN OLD;
	END IF;
	RAISE EXCEPTION 'The audit log is append-only.' USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "audit_log_append_only" BEFORE UPDATE OR DELETE ON "audit_log" FOR EACH ROW EXECUTE FUNCTION "audit_log_append_only"();--> statement-breakpoint
CREATE TRIGGER "audit_log_no_truncate" BEFORE TRUNCATE ON "audit_log" FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_append_only"();
