CREATE TABLE "check_ins" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"trip_stop_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"checked_in_at" timestamp with time zone NOT NULL,
	CONSTRAINT "check_ins_stop_user_unique" UNIQUE("trip_stop_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_check";--> statement-breakpoint
ALTER TABLE "outbox_events" DROP CONSTRAINT "outbox_events_kind_check";--> statement-breakpoint
ALTER TABLE "scheduled_notifications" DROP CONSTRAINT "scheduled_notifications_kind_check";--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_trip_stop_id_trip_stops_id_fk" FOREIGN KEY ("trip_stop_id") REFERENCES "public"."trip_stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" in ('request_new', 'request_halfway', 'pay_now', 'pay_reminder', 'booking_confirmed', 'booking_confirmed_driver', 'request_declined', 'request_expired', 'request_expired_driver', 'request_withdrawn', 'payment_window_ended', 'payment_window_ended_driver', 'departure_moved', 'departure_moved_far', 'trip_changed', 'trip_cancelled', 'booking_cancelled_by_driver', 'booking_cancelled_by_passenger', 'refund_issued', 'meeting_point_changed', 'meeting_point_changed_driver', 'new_message', 'unread_messages', 'reminder_evening', 'reminder_evening_driver', 'reminder_hour', 'reminder_hour_driver', 'payout_sent', 'checked_in', 'checked_in_driver'));--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_kind_check" CHECK ("outbox_events"."kind" in ('BookingRequested', 'BookingAccepted', 'BookingConfirmed', 'BookingDeclined', 'BookingExpired', 'BookingWithdrawn', 'BookingCancelled', 'DepartureMoved', 'TripChanged', 'TripCancelled', 'RefundIssued', 'MessageSent', 'CheckedIn'));--> statement-breakpoint
ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "scheduled_notifications_kind_check" CHECK ("scheduled_notifications"."kind" in ('request_new', 'request_halfway', 'pay_now', 'pay_reminder', 'booking_confirmed', 'booking_confirmed_driver', 'request_declined', 'request_expired', 'request_expired_driver', 'request_withdrawn', 'payment_window_ended', 'payment_window_ended_driver', 'departure_moved', 'departure_moved_far', 'trip_changed', 'trip_cancelled', 'booking_cancelled_by_driver', 'booking_cancelled_by_passenger', 'refund_issued', 'meeting_point_changed', 'meeting_point_changed_driver', 'new_message', 'unread_messages', 'reminder_evening', 'reminder_evening_driver', 'reminder_hour', 'reminder_hour_driver', 'payout_sent', 'checked_in', 'checked_in_driver'));