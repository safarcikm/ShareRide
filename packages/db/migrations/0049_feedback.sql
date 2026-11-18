CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"app_version" text NOT NULL,
	"platform" text NOT NULL,
	"os_version" text NOT NULL,
	"screen" text NOT NULL,
	"language" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"reply" text,
	"replied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_kind_check" CHECK ("feedback"."kind" in ('problem', 'idea', 'other')),
	CONSTRAINT "feedback_platform_check" CHECK ("feedback"."platform" in ('ios', 'android', 'web')),
	CONSTRAINT "feedback_status_check" CHECK ("feedback"."status" in ('new', 'read', 'planned', 'done', 'wont_do')),
	CONSTRAINT "feedback_language_check" CHECK ("feedback"."language" in ('is', 'en')),
	CONSTRAINT "feedback_message_check" CHECK (char_length("feedback"."message") between 1 and 2000),
	CONSTRAINT "feedback_reply_check" CHECK (char_length("feedback"."reply") between 1 and 1000),
	CONSTRAINT "feedback_replied_check" CHECK (("feedback"."replied_at" is null) = ("feedback"."reply" is null))
);
--> statement-breakpoint
CREATE TABLE "feedback_screenshots" (
	"feedback_id" uuid PRIMARY KEY NOT NULL,
	"file" "bytea" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_screenshots_size_check" CHECK (octet_length("feedback_screenshots"."file") <= 1048576)
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_check";--> statement-breakpoint
ALTER TABLE "outbox_events" DROP CONSTRAINT "outbox_events_kind_check";--> statement-breakpoint
ALTER TABLE "scheduled_notifications" DROP CONSTRAINT "scheduled_notifications_kind_check";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "feedback_id" uuid;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_screenshots" ADD CONSTRAINT "feedback_screenshots_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_user_index" ON "feedback" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "feedback_created_index" ON "feedback" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_feedback_index" ON "notifications" USING btree ("feedback_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" in ('request_new', 'request_halfway', 'pay_now', 'pay_reminder', 'booking_confirmed', 'booking_confirmed_driver', 'request_declined', 'request_expired', 'request_expired_driver', 'request_withdrawn', 'payment_window_ended', 'payment_window_ended_driver', 'departure_moved', 'departure_moved_far', 'trip_changed', 'trip_cancelled', 'booking_cancelled_by_driver', 'booking_cancelled_by_passenger', 'booking_cancelled_by_shareride', 'refund_issued', 'meeting_point_changed', 'meeting_point_changed_driver', 'meeting_point_moved', 'meeting_point_moved_driver', 'new_message', 'unread_messages', 'reminder_evening', 'reminder_evening_driver', 'reminder_hour', 'reminder_hour_driver', 'payout_sent', 'checked_in', 'checked_in_driver', 'no_show_marked', 'driver_absent_reported', 'dispute_decided', 'dispute_decided_driver', 'rate_trip', 'rate_trip_driver', 'review_visible', 'data_export_ready', 'moderation_action', 'suspension_ended', 'appeal_answered', 'report_closed', 'report_filed', 'report_filed_urgent', 'account_deletion_scheduled', 'privacy_request_answered', 'feedback_replied'));--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_kind_check" CHECK ("outbox_events"."kind" in ('BookingRequested', 'BookingAccepted', 'BookingConfirmed', 'BookingDeclined', 'BookingExpired', 'BookingWithdrawn', 'BookingCancelled', 'DepartureMoved', 'TripChanged', 'TripCancelled', 'RefundIssued', 'MessageSent', 'CheckedIn', 'NoShowMarked', 'DriverAbsentReported', 'DisputeDecided', 'BookingCompleted', 'ReviewRevealed', 'MeetingPointChanged', 'MeetingPointMoved', 'DataExportReady', 'ReportFiled', 'AccountDeletionScheduled', 'PrivacyRequestAnswered', 'ModerationActionTaken', 'SuspensionEnded', 'AppealAnswered', 'ReportClosed', 'FeedbackReplied'));--> statement-breakpoint
ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "scheduled_notifications_kind_check" CHECK ("scheduled_notifications"."kind" in ('request_new', 'request_halfway', 'pay_now', 'pay_reminder', 'booking_confirmed', 'booking_confirmed_driver', 'request_declined', 'request_expired', 'request_expired_driver', 'request_withdrawn', 'payment_window_ended', 'payment_window_ended_driver', 'departure_moved', 'departure_moved_far', 'trip_changed', 'trip_cancelled', 'booking_cancelled_by_driver', 'booking_cancelled_by_passenger', 'booking_cancelled_by_shareride', 'refund_issued', 'meeting_point_changed', 'meeting_point_changed_driver', 'meeting_point_moved', 'meeting_point_moved_driver', 'new_message', 'unread_messages', 'reminder_evening', 'reminder_evening_driver', 'reminder_hour', 'reminder_hour_driver', 'payout_sent', 'checked_in', 'checked_in_driver', 'no_show_marked', 'driver_absent_reported', 'dispute_decided', 'dispute_decided_driver', 'rate_trip', 'rate_trip_driver', 'review_visible', 'data_export_ready', 'moderation_action', 'suspension_ended', 'appeal_answered', 'report_closed', 'report_filed', 'report_filed_urgent', 'account_deletion_scheduled', 'privacy_request_answered', 'feedback_replied'));