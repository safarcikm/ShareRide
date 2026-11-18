CREATE TABLE "setting_changes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"version" integer NOT NULL,
	"key" text NOT NULL,
	"old_value" integer NOT NULL,
	"new_value" integer NOT NULL,
	"reason" text NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "setting_changes_version_unique" UNIQUE("version"),
	CONSTRAINT "setting_changes_version_check" CHECK ("setting_changes"."version" >= 1),
	CONSTRAINT "setting_changes_reason_check" CHECK (char_length("setting_changes"."reason") between 1 and 500)
);
--> statement-breakpoint
-- The settings history cannot be edited (spec 10, R10.2; ADR 0032).
-- Written by hand, because drizzle-kit does not model triggers: keep this
-- part when the migration is generated again. No change can be updated or
-- deleted, and the table cannot be emptied, as the values of every
-- settings version are worked out from it.
CREATE FUNCTION "setting_changes_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'The settings history is append-only.' USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "setting_changes_append_only" BEFORE UPDATE OR DELETE ON "setting_changes" FOR EACH ROW EXECUTE FUNCTION "setting_changes_append_only"();--> statement-breakpoint
CREATE TRIGGER "setting_changes_no_truncate" BEFORE TRUNCATE ON "setting_changes" FOR EACH STATEMENT EXECUTE FUNCTION "setting_changes_append_only"();
