CREATE TABLE "holds" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"set_by" uuid NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holds_subject_type_check" CHECK ("holds"."subject_type" in ('user', 'trip', 'booking')),
	CONSTRAINT "holds_reason_check" CHECK (length(trim("holds"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "retention_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"rule" text NOT NULL,
	"ran_at" timestamp with time zone NOT NULL,
	"erased" integer DEFAULT 0 NOT NULL,
	"anonymised" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "retention_runs_counts_check" CHECK ("retention_runs"."erased" >= 0 and "retention_runs"."anonymised" >= 0)
);
--> statement-breakpoint
CREATE INDEX "holds_subject_index" ON "holds" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "retention_runs_rule_index" ON "retention_runs" USING btree ("rule","ran_at");