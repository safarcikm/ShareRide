CREATE TABLE "trip_changes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"trip_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"changed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_changes_kind_check" CHECK ("trip_changes"."kind" in ('departure', 'seats', 'priceLevel', 'vehicle', 'bookingMode', 'details'))
);
--> statement-breakpoint
ALTER TABLE "outbox_events" DROP CONSTRAINT "outbox_events_kind_check";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "trip_change_id" uuid;--> statement-breakpoint
ALTER TABLE "trip_changes" ADD CONSTRAINT "trip_changes_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trip_changes_trip_index" ON "trip_changes" USING btree ("trip_id","changed_at");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_trip_change_id_trip_changes_id_fk" FOREIGN KEY ("trip_change_id") REFERENCES "public"."trip_changes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_trip_change_index" ON "notifications" USING btree ("trip_change_id");--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_kind_check" CHECK ("outbox_events"."kind" in ('BookingRequested', 'BookingAccepted', 'BookingConfirmed', 'BookingDeclined', 'BookingExpired', 'BookingWithdrawn', 'BookingCancelled', 'DepartureMoved', 'TripCancelled', 'RefundIssued', 'MessageSent'));