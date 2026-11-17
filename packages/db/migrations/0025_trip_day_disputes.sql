CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"booking_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"raised_at" timestamp with time zone NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"answer" text,
	"answered_at" timestamp with time zone,
	"answer_note" text DEFAULT '' NOT NULL,
	"outcome" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disputes_kind_check" CHECK ("disputes"."kind" in ('no_show', 'driver_absent')),
	CONSTRAINT "disputes_answer_check" CHECK ("disputes"."answer" in ('agreed', 'contested')),
	CONSTRAINT "disputes_outcome_check" CHECK ("disputes"."outcome" in ('stands', 'rode', 'left_behind', 'passenger_absent')),
	CONSTRAINT "disputes_decided_by_check" CHECK ("disputes"."decided_by" in ('system', 'operator')),
	CONSTRAINT "disputes_note_check" CHECK (char_length("disputes"."note") <= 500),
	CONSTRAINT "disputes_answer_note_check" CHECK (char_length("disputes"."answer_note") <= 500),
	CONSTRAINT "disputes_decision_note_check" CHECK (char_length("disputes"."decision_note") <= 500),
	CONSTRAINT "disputes_answered_check" CHECK (("disputes"."answer" is null) = ("disputes"."answered_at" is null)),
	CONSTRAINT "disputes_decided_check" CHECK (("disputes"."outcome" is null) = ("disputes"."decided_at" is null) and ("disputes"."outcome" is null) = ("disputes"."decided_by" is null)),
	CONSTRAINT "disputes_operator_check" CHECK ("disputes"."decided_by" is distinct from 'operator' or "disputes"."answer" = 'contested'),
	CONSTRAINT "disputes_kind_outcome_check" CHECK ("disputes"."outcome" is null or ("disputes"."kind" = 'no_show' and "disputes"."outcome" in ('stands', 'rode', 'left_behind')) or ("disputes"."kind" = 'driver_absent' and "disputes"."outcome" in ('stands', 'rode', 'passenger_absent')))
);
--> statement-breakpoint
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_cancel_reason_check";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_check";--> statement-breakpoint
ALTER TABLE "outbox_events" DROP CONSTRAINT "outbox_events_kind_check";--> statement-breakpoint
ALTER TABLE "scheduled_notifications" DROP CONSTRAINT "scheduled_notifications_kind_check";--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "disputes_booking_unique" ON "disputes" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "disputes_open_index" ON "disputes" USING btree ("raised_at") WHERE "disputes"."outcome" is null;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancel_reason_check" CHECK ("bookings"."cancel_reason" in ('weather', 'road_closed', 'car_problem', 'illness', 'plans_changed', 'other', 'passenger_asked', 'car_smaller', 'found_another', 'trip_changed', 'driver_absent'));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" in ('request_new', 'request_halfway', 'pay_now', 'pay_reminder', 'booking_confirmed', 'booking_confirmed_driver', 'request_declined', 'request_expired', 'request_expired_driver', 'request_withdrawn', 'payment_window_ended', 'payment_window_ended_driver', 'departure_moved', 'departure_moved_far', 'trip_changed', 'trip_cancelled', 'booking_cancelled_by_driver', 'booking_cancelled_by_passenger', 'refund_issued', 'meeting_point_changed', 'meeting_point_changed_driver', 'new_message', 'unread_messages', 'reminder_evening', 'reminder_evening_driver', 'reminder_hour', 'reminder_hour_driver', 'payout_sent', 'checked_in', 'checked_in_driver', 'no_show_marked', 'driver_absent_reported', 'dispute_decided', 'dispute_decided_driver', 'data_export_ready'));--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_kind_check" CHECK ("outbox_events"."kind" in ('BookingRequested', 'BookingAccepted', 'BookingConfirmed', 'BookingDeclined', 'BookingExpired', 'BookingWithdrawn', 'BookingCancelled', 'DepartureMoved', 'TripChanged', 'TripCancelled', 'RefundIssued', 'MessageSent', 'CheckedIn', 'NoShowMarked', 'DriverAbsentReported', 'DisputeDecided', 'DataExportReady'));--> statement-breakpoint
ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "scheduled_notifications_kind_check" CHECK ("scheduled_notifications"."kind" in ('request_new', 'request_halfway', 'pay_now', 'pay_reminder', 'booking_confirmed', 'booking_confirmed_driver', 'request_declined', 'request_expired', 'request_expired_driver', 'request_withdrawn', 'payment_window_ended', 'payment_window_ended_driver', 'departure_moved', 'departure_moved_far', 'trip_changed', 'trip_cancelled', 'booking_cancelled_by_driver', 'booking_cancelled_by_passenger', 'refund_issued', 'meeting_point_changed', 'meeting_point_changed_driver', 'new_message', 'unread_messages', 'reminder_evening', 'reminder_evening_driver', 'reminder_hour', 'reminder_hour_driver', 'payout_sent', 'checked_in', 'checked_in_driver', 'no_show_marked', 'driver_absent_reported', 'dispute_decided', 'dispute_decided_driver', 'data_export_ready'));