CREATE TABLE "meeting_point_issues" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"meeting_point_id" uuid NOT NULL,
	"reporter_id" uuid,
	"reason" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution_note" text,
	"resolved_by_id" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_point_issues_reason_check" CHECK ("meeting_point_issues"."reason" in ('closed_or_moved', 'unsafe', 'wrong_location', 'wrong_information', 'other')),
	CONSTRAINT "meeting_point_issues_status_check" CHECK ("meeting_point_issues"."status" in ('open', 'resolved')),
	CONSTRAINT "meeting_point_issues_resolved_check" CHECK (("meeting_point_issues"."status" = 'resolved') = ("meeting_point_issues"."resolved_at" is not null) and ("meeting_point_issues"."status" = 'resolved') = ("meeting_point_issues"."resolution_note" is not null) and ("meeting_point_issues"."status" = 'open' or "meeting_point_issues"."reporter_id" is null))
);
--> statement-breakpoint
ALTER TABLE "meeting_point_issues" ADD CONSTRAINT "meeting_point_issues_meeting_point_id_meeting_points_id_fk" FOREIGN KEY ("meeting_point_id") REFERENCES "public"."meeting_points"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_point_issues" ADD CONSTRAINT "meeting_point_issues_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_point_issues" ADD CONSTRAINT "meeting_point_issues_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meeting_point_issues_reporter_index" ON "meeting_point_issues" USING btree ("reporter_id","created_at");--> statement-breakpoint
CREATE INDEX "meeting_point_issues_point_index" ON "meeting_point_issues" USING btree ("meeting_point_id");--> statement-breakpoint
CREATE INDEX "meeting_point_issues_open_index" ON "meeting_point_issues" USING btree ("created_at") WHERE "meeting_point_issues"."status" = 'open';--> statement-breakpoint
CREATE INDEX "meeting_point_issues_resolved_index" ON "meeting_point_issues" USING btree ("resolved_at");