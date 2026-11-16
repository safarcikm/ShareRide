CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"reporter_id" uuid,
	"subject_user_id" uuid,
	"subject" text NOT NULL,
	"trip_id" uuid,
	"booking_id" uuid,
	"message_id" uuid,
	"conversation_id" uuid,
	"category" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"urgent" boolean NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"outcome" text,
	"closed_by_id" uuid,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_subject_check" CHECK ("reports"."subject" in ('user', 'trip', 'message', 'review', 'booking')),
	CONSTRAINT "reports_category_check" CHECK ("reports"."category" in ('safety', 'harassment', 'discrimination', 'scam', 'false_info', 'offensive', 'not_as_listed', 'other')),
	CONSTRAINT "reports_status_check" CHECK ("reports"."status" in ('open', 'closed')),
	CONSTRAINT "reports_outcome_check" CHECK ("reports"."outcome" is null or "reports"."outcome" in ('action_taken', 'no_breach')),
	CONSTRAINT "reports_closed_check" CHECK (("reports"."status" = 'closed') = ("reports"."closed_at" is not null and "reports"."outcome" is not null))
);
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_subject_user_id_users_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_closed_by_id_users_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_reporter_index" ON "reports" USING btree ("reporter_id","created_at");--> statement-breakpoint
CREATE INDEX "reports_subject_user_index" ON "reports" USING btree ("subject_user_id");--> statement-breakpoint
CREATE INDEX "reports_open_index" ON "reports" USING btree ("urgent","created_at") WHERE "reports"."status" = 'open';--> statement-breakpoint
CREATE INDEX "reports_conversation_index" ON "reports" USING btree ("conversation_id");