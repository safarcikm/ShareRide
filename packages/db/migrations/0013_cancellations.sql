ALTER TABLE "outbox_events" DROP CONSTRAINT "outbox_events_kind_check";--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "cancel_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refund_amount" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "counts_on_reliability" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "departs_at_when_booked" timestamp with time zone;--> statement-breakpoint
-- Bookings made before this take their trip's departure as it is now (spec 6, plan 4.2).
UPDATE "bookings" SET "departs_at_when_booked" = "trips"."departs_at" FROM "trips" WHERE "trips"."id" = "bookings"."trip_id";--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancel_reason_check" CHECK ("bookings"."cancel_reason" in ('weather', 'road_closed', 'car_problem', 'illness', 'plans_changed', 'other', 'passenger_asked', 'car_smaller', 'found_another', 'trip_changed'));--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_cancel_note_check" CHECK (char_length("bookings"."cancel_note") <= 500);--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_refund_check" CHECK ("bookings"."refund_amount" is null or "bookings"."refund_amount" between 0 and "bookings"."total_price");--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_kind_check" CHECK ("outbox_events"."kind" in ('BookingRequested', 'BookingAccepted', 'BookingConfirmed', 'BookingDeclined', 'BookingExpired', 'BookingWithdrawn', 'BookingCancelled', 'RefundIssued', 'MessageSent'));