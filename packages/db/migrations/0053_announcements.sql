CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"audience" text NOT NULL,
	"corridor_id" uuid,
	"title_is" text NOT NULL,
	"title_en" text NOT NULL,
	"message_is" text NOT NULL,
	"message_en" text NOT NULL,
	"created_by" uuid NOT NULL,
	"test_sent_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"reach" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcements_audience_check" CHECK ("announcements"."audience" in ('everyone', 'drivers', 'passengers', 'corridor')),
	CONSTRAINT "announcements_corridor_check" CHECK (("announcements"."audience" = 'corridor') = ("announcements"."corridor_id" is not null)),
	CONSTRAINT "announcements_texts_check" CHECK (char_length("announcements"."title_is") between 1 and 80 and char_length("announcements"."title_en") between 1 and 80 and char_length("announcements"."message_is") between 1 and 1000 and char_length("announcements"."message_en") between 1 and 1000),
	CONSTRAINT "announcements_sent_check" CHECK (("announcements"."sent_at" is null) = ("announcements"."reach" is null))
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_check";--> statement-breakpoint
ALTER TABLE "outbox_events" DROP CONSTRAINT "outbox_events_kind_check";--> statement-breakpoint
ALTER TABLE "scheduled_notifications" DROP CONSTRAINT "scheduled_notifications_kind_check";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "announcement_id" uuid;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_corridor_id_corridors_id_fk" FOREIGN KEY ("corridor_id") REFERENCES "public"."corridors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcements_sent_index" ON "announcements" USING btree ("sent_at");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_announcement_index" ON "notifications" USING btree ("announcement_id","recipient_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" in ('request_new', 'request_halfway', 'pay_now', 'pay_reminder', 'booking_confirmed', 'booking_confirmed_driver', 'request_declined', 'request_expired', 'request_expired_driver', 'request_withdrawn', 'payment_window_ended', 'payment_window_ended_driver', 'departure_moved', 'departure_moved_far', 'trip_changed', 'trip_cancelled', 'booking_cancelled_by_driver', 'booking_cancelled_by_passenger', 'booking_cancelled_by_shareride', 'refund_issued', 'meeting_point_changed', 'meeting_point_changed_driver', 'meeting_point_moved', 'meeting_point_moved_driver', 'new_message', 'unread_messages', 'reminder_evening', 'reminder_evening_driver', 'reminder_hour', 'reminder_hour_driver', 'payout_sent', 'checked_in', 'checked_in_driver', 'no_show_marked', 'driver_absent_reported', 'dispute_decided', 'dispute_decided_driver', 'rate_trip', 'rate_trip_driver', 'review_visible', 'data_export_ready', 'moderation_action', 'suspension_ended', 'appeal_answered', 'report_closed', 'report_filed', 'report_filed_urgent', 'account_deletion_scheduled', 'privacy_request_answered', 'feedback_replied', 'switch_still_off', 'announcement', 'announcement_test'));--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_kind_check" CHECK ("outbox_events"."kind" in ('BookingRequested', 'BookingAccepted', 'BookingConfirmed', 'BookingDeclined', 'BookingExpired', 'BookingWithdrawn', 'BookingCancelled', 'DepartureMoved', 'TripChanged', 'TripCancelled', 'RefundIssued', 'MessageSent', 'CheckedIn', 'NoShowMarked', 'DriverAbsentReported', 'DisputeDecided', 'BookingCompleted', 'ReviewRevealed', 'MeetingPointChanged', 'MeetingPointMoved', 'DataExportReady', 'ReportFiled', 'AccountDeletionScheduled', 'PrivacyRequestAnswered', 'ModerationActionTaken', 'SuspensionEnded', 'AppealAnswered', 'ReportClosed', 'FeedbackReplied', 'AnnouncementSent', 'AnnouncementTested'));--> statement-breakpoint
ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "scheduled_notifications_kind_check" CHECK ("scheduled_notifications"."kind" in ('request_new', 'request_halfway', 'pay_now', 'pay_reminder', 'booking_confirmed', 'booking_confirmed_driver', 'request_declined', 'request_expired', 'request_expired_driver', 'request_withdrawn', 'payment_window_ended', 'payment_window_ended_driver', 'departure_moved', 'departure_moved_far', 'trip_changed', 'trip_cancelled', 'booking_cancelled_by_driver', 'booking_cancelled_by_passenger', 'booking_cancelled_by_shareride', 'refund_issued', 'meeting_point_changed', 'meeting_point_changed_driver', 'meeting_point_moved', 'meeting_point_moved_driver', 'new_message', 'unread_messages', 'reminder_evening', 'reminder_evening_driver', 'reminder_hour', 'reminder_hour_driver', 'payout_sent', 'checked_in', 'checked_in_driver', 'no_show_marked', 'driver_absent_reported', 'dispute_decided', 'dispute_decided_driver', 'rate_trip', 'rate_trip_driver', 'review_visible', 'data_export_ready', 'moderation_action', 'suspension_ended', 'appeal_answered', 'report_closed', 'report_filed', 'report_filed_urgent', 'account_deletion_scheduled', 'privacy_request_answered', 'feedback_replied', 'switch_still_off', 'announcement', 'announcement_test'));