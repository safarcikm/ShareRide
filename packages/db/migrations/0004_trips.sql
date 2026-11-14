CREATE TABLE "segments" (
	"trip_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"from_stop_id" uuid NOT NULL,
	"to_stop_id" uuid NOT NULL,
	"distance_m" integer NOT NULL,
	"duration_s" integer NOT NULL,
	"suggested_price" integer NOT NULL,
	"cap" integer NOT NULL,
	"price" integer NOT NULL,
	"currency" text DEFAULT 'ISK' NOT NULL,
	"capacity" integer NOT NULL,
	"occupancy" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "segments_trip_id_position_pk" PRIMARY KEY("trip_id","position"),
	CONSTRAINT "segments_position_check" CHECK ("segments"."position" >= 0),
	CONSTRAINT "segments_price_check" CHECK ("segments"."price" between 0 and "segments"."cap"),
	CONSTRAINT "segments_currency_check" CHECK ("segments"."currency" = 'ISK'),
	CONSTRAINT "segments_occupancy_check" CHECK ("segments"."occupancy" between 0 and "segments"."capacity")
);
--> statement-breakpoint
CREATE TABLE "trip_stops" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"trip_id" uuid NOT NULL,
	"meeting_point_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"planned_at" timestamp with time zone,
	CONSTRAINT "trip_stops_position_unique" UNIQUE("trip_id","position"),
	CONSTRAINT "trip_stops_point_unique" UNIQUE("trip_id","meeting_point_id"),
	CONSTRAINT "trip_stops_position_check" CHECK ("trip_stops"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"driver_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"capacity" integer NOT NULL,
	"price_level" integer NOT NULL,
	"booking_mode" text NOT NULL,
	"luggage" text NOT NULL,
	"pets" text NOT NULL,
	"smoking" text NOT NULL,
	"child_seat" boolean NOT NULL,
	"chat" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"departs_at" timestamp with time zone,
	"arrives_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trips_status_check" CHECK ("trips"."status" in ('draft', 'published', 'departed', 'completed', 'cancelled')),
	CONSTRAINT "trips_capacity_check" CHECK ("trips"."capacity" between 1 and 8),
	CONSTRAINT "trips_price_level_check" CHECK ("trips"."price_level" >= 0),
	CONSTRAINT "trips_booking_mode_check" CHECK ("trips"."booking_mode" in ('approval', 'instant')),
	CONSTRAINT "trips_luggage_check" CHECK ("trips"."luggage" in ('small_bag', 'suitcase', 'by_arrangement')),
	CONSTRAINT "trips_pets_check" CHECK ("trips"."pets" in ('no', 'ask', 'yes')),
	CONSTRAINT "trips_smoking_check" CHECK ("trips"."smoking" in ('no', 'breaks_outside')),
	CONSTRAINT "trips_chat_check" CHECK ("trips"."chat" in ('quiet', 'some', 'chatty')),
	CONSTRAINT "trips_note_check" CHECK (char_length("trips"."note") <= 500),
	CONSTRAINT "trips_times_check" CHECK (("trips"."departs_at" is null) = ("trips"."arrives_at" is null) and ("trips"."status" = 'draft' or "trips"."departs_at" is null or "trips"."departs_at" < "trips"."arrives_at")),
	CONSTRAINT "trips_published_check" CHECK ("trips"."status" = 'draft' or ("trips"."vehicle_id" is not null and "trips"."departs_at" is not null and "trips"."published_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_from_stop_id_trip_stops_id_fk" FOREIGN KEY ("from_stop_id") REFERENCES "public"."trip_stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segments" ADD CONSTRAINT "segments_to_stop_id_trip_stops_id_fk" FOREIGN KEY ("to_stop_id") REFERENCES "public"."trip_stops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_meeting_point_id_meeting_points_id_fk" FOREIGN KEY ("meeting_point_id") REFERENCES "public"."meeting_points"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trip_stops_point_index" ON "trip_stops" USING btree ("meeting_point_id","planned_at");--> statement-breakpoint
CREATE INDEX "trips_driver_index" ON "trips" USING btree ("driver_id","status");--> statement-breakpoint
CREATE INDEX "trips_departs_index" ON "trips" USING btree ("status","departs_at");