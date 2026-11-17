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
	CONSTRAINT "reports_closed_check" CHECK (("reports"."status" = 'closed') = ("reports"."closed_at" is not null) and ("reports"."status" = 'closed') = ("reports"."outcome" is not null))
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_check";--> statement-breakpoint
ALTER TABLE "outbox_events" DROP CONSTRAINT "outbox_events_kind_check";--> statement-breakpoint
ALTER TABLE "scheduled_notifications" DROP CONSTRAINT "scheduled_notifications_kind_check";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "report_id" uuid;--> statement-breakpoint
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
CREATE INDEX "reports_conversation_index" ON "reports" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "reports_trip_index" ON "reports" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "reports_booking_index" ON "reports" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "reports_message_index" ON "reports" USING btree ("message_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_report_index" ON "notifications" USING btree ("report_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" in ('request_new', 'request_halfway', 'pay_now', 'pay_reminder', 'booking_confirmed', 'booking_confirmed_driver', 'request_declined', 'request_expired', 'request_expired_driver', 'request_withdrawn', 'payment_window_ended', 'payment_window_ended_driver', 'departure_moved', 'departure_moved_far', 'trip_changed', 'trip_cancelled', 'booking_cancelled_by_driver', 'booking_cancelled_by_passenger', 'refund_issued', 'meeting_point_changed', 'meeting_point_changed_driver', 'new_message', 'unread_messages', 'reminder_evening', 'reminder_evening_driver', 'reminder_hour', 'reminder_hour_driver', 'payout_sent', 'checked_in', 'checked_in_driver', 'no_show_marked', 'driver_absent_reported', 'dispute_decided', 'dispute_decided_driver', 'data_export_ready', 'report_filed', 'report_filed_urgent', 'account_deletion_scheduled'));--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_kind_check" CHECK ("outbox_events"."kind" in ('BookingRequested', 'BookingAccepted', 'BookingConfirmed', 'BookingDeclined', 'BookingExpired', 'BookingWithdrawn', 'BookingCancelled', 'DepartureMoved', 'TripChanged', 'TripCancelled', 'RefundIssued', 'MessageSent', 'CheckedIn', 'NoShowMarked', 'DriverAbsentReported', 'DisputeDecided', 'DataExportReady', 'ReportFiled', 'AccountDeletionScheduled'));--> statement-breakpoint
ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "scheduled_notifications_kind_check" CHECK ("scheduled_notifications"."kind" in ('request_new', 'request_halfway', 'pay_now', 'pay_reminder', 'booking_confirmed', 'booking_confirmed_driver', 'request_declined', 'request_expired', 'request_expired_driver', 'request_withdrawn', 'payment_window_ended', 'payment_window_ended_driver', 'departure_moved', 'departure_moved_far', 'trip_changed', 'trip_cancelled', 'booking_cancelled_by_driver', 'booking_cancelled_by_passenger', 'refund_issued', 'meeting_point_changed', 'meeting_point_changed_driver', 'new_message', 'unread_messages', 'reminder_evening', 'reminder_evening_driver', 'reminder_hour', 'reminder_hour_driver', 'payout_sent', 'checked_in', 'checked_in_driver', 'no_show_marked', 'driver_absent_reported', 'dispute_decided', 'dispute_decided_driver', 'data_export_ready', 'report_filed', 'report_filed_urgent', 'account_deletion_scheduled'));