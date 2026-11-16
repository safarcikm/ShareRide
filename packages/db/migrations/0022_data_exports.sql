CREATE TABLE "data_exports" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"asked_at" timestamp with time zone NOT NULL,
	"ready_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"file" "bytea",
	"byte_size" integer,
	"link_hash" text,
	"link_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_exports_link_unique" UNIQUE("link_hash"),
	CONSTRAINT "data_exports_ready_check" CHECK (("data_exports"."ready_at" is null) = ("data_exports"."expires_at" is null) and ("data_exports"."file" is null or "data_exports"."ready_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_check";--> statement-breakpoint
ALTER TABLE "outbox_events" DROP CONSTRAINT "outbox_events_kind_check";--> statement-breakpoint
ALTER TABLE "scheduled_notifications" DROP CONSTRAINT "scheduled_notifications_kind_check";--> statement-breakpoint
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_exports_user_index" ON "data_exports" USING btree ("user_id","asked_at");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" in ('request_new', 'request_halfway', 'pay_now', 'pay_reminder', 'booking_confirmed', 'booking_confirmed_driver', 'request_declined', 'request_expired', 'request_expired_driver', 'request_withdrawn', 'payment_window_ended', 'payment_window_ended_driver', 'departure_moved', 'departure_moved_far', 'trip_changed', 'trip_cancelled', 'booking_cancelled_by_driver', 'booking_cancelled_by_passenger', 'refund_issued', 'meeting_point_changed', 'meeting_point_changed_driver', 'new_message', 'unread_messages', 'reminder_evening', 'reminder_evening_driver', 'reminder_hour', 'reminder_hour_driver', 'payout_sent', 'data_export_ready'));--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_kind_check" CHECK ("outbox_events"."kind" in ('BookingRequested', 'BookingAccepted', 'BookingConfirmed', 'BookingDeclined', 'BookingExpired', 'BookingWithdrawn', 'BookingCancelled', 'DepartureMoved', 'TripChanged', 'TripCancelled', 'RefundIssued', 'MessageSent', 'DataExportReady'));--> statement-breakpoint
ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "scheduled_notifications_kind_check" CHECK ("scheduled_notifications"."kind" in ('request_new', 'request_halfway', 'pay_now', 'pay_reminder', 'booking_confirmed', 'booking_confirmed_driver', 'request_declined', 'request_expired', 'request_expired_driver', 'request_withdrawn', 'payment_window_ended', 'payment_window_ended_driver', 'departure_moved', 'departure_moved_far', 'trip_changed', 'trip_cancelled', 'booking_cancelled_by_driver', 'booking_cancelled_by_passenger', 'refund_issued', 'meeting_point_changed', 'meeting_point_changed_driver', 'new_message', 'unread_messages', 'reminder_evening', 'reminder_evening_driver', 'reminder_hour', 'reminder_hour_driver', 'payout_sent', 'data_export_ready'));