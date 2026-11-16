ALTER TABLE "trip_stops" DROP CONSTRAINT "trip_stops_position_unique";--> statement-breakpoint
ALTER TABLE "trip_stops" DROP CONSTRAINT "trip_stops_point_unique";--> statement-breakpoint
ALTER TABLE "trip_changes" DROP CONSTRAINT "trip_changes_kind_check";--> statement-breakpoint
ALTER TABLE "trip_stops" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "trip_stops_live_position_unique" ON "trip_stops" USING btree ("trip_id","position") WHERE "trip_stops"."removed_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "trip_stops_live_point_unique" ON "trip_stops" USING btree ("trip_id","meeting_point_id") WHERE "trip_stops"."removed_at" is null;--> statement-breakpoint
ALTER TABLE "trip_changes" ADD CONSTRAINT "trip_changes_kind_check" CHECK ("trip_changes"."kind" in ('departure', 'seats', 'priceLevel', 'vehicle', 'bookingMode', 'details', 'addStop', 'removeStop'));