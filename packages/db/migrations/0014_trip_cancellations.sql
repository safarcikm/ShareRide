ALTER TABLE "outbox_events" DROP CONSTRAINT "outbox_events_kind_check";--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "cancel_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "counts_on_reliability" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_kind_check" CHECK ("outbox_events"."kind" in ('BookingRequested', 'BookingAccepted', 'BookingConfirmed', 'BookingDeclined', 'BookingExpired', 'BookingWithdrawn', 'BookingCancelled', 'TripCancelled', 'RefundIssued', 'MessageSent'));--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_cancel_reason_check" CHECK ("trips"."cancel_reason" in ('weather', 'road_closed', 'car_problem', 'illness', 'plans_changed', 'other'));--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_cancel_note_check" CHECK (char_length("trips"."cancel_note") <= 500);