CREATE TABLE "booking_segment_prices" (
	"booking_id" uuid NOT NULL,
	"segment_position" integer NOT NULL,
	"price" integer NOT NULL,
	CONSTRAINT "booking_segment_prices_booking_id_segment_position_pk" PRIMARY KEY("booking_id","segment_position"),
	CONSTRAINT "booking_segment_prices_price_check" CHECK ("booking_segment_prices"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"trip_id" uuid NOT NULL,
	"passenger_id" uuid NOT NULL,
	"from_stop_id" uuid NOT NULL,
	"to_stop_id" uuid NOT NULL,
	"seats" integer NOT NULL,
	"status" text NOT NULL,
	"total_price" integer NOT NULL,
	"currency" text DEFAULT 'ISK' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"decline_reason" text,
	"attempt_key" uuid NOT NULL,
	"requested_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"payment_due_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_attempt_key_unique" UNIQUE("passenger_id","attempt_key"),
	CONSTRAINT "bookings_status_check" CHECK ("bookings"."status" in ('requested', 'accepted', 'confirmed', 'declined', 'expired', 'cancelled', 'completed', 'no_show')),
	CONSTRAINT "bookings_seats_check" CHECK ("bookings"."seats" between 1 and 8),
	CONSTRAINT "bookings_price_check" CHECK ("bookings"."total_price" >= 0),
	CONSTRAINT "bookings_currency_check" CHECK ("bookings"."currency" = 'ISK'),
	CONSTRAINT "bookings_message_check" CHECK (char_length("bookings"."message") <= 300),
	CONSTRAINT "bookings_decline_reason_check" CHECK ("bookings"."decline_reason" in ('plans_changed', 'luggage', 'other')),
	CONSTRAINT "bookings_cancelled_by_check" CHECK ("bookings"."cancelled_by" in ('passenger', 'driver', 'operator')),
	CONSTRAINT "bookings_stops_check" CHECK ("bookings"."from_stop_id" <> "bookings"."to_stop_id"),
	CONSTRAINT "bookings_deadlines_check" CHECK (("bookings"."status" <> 'requested' or "bookings"."expires_at" is not null) and ("bookings"."status" <> 'accepted' or "bookings"."payment_due_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "booking_segment_prices" ADD CONSTRAINT "booking_segment_prices_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_passenger_id_users_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_from_stop_id_trip_stops_id_fk" FOREIGN KEY ("from_stop_id") REFERENCES "public"."trip_stops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_to_stop_id_trip_stops_id_fk" FOREIGN KEY ("to_stop_id") REFERENCES "public"."trip_stops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_passenger_index" ON "bookings" USING btree ("passenger_id","status");--> statement-breakpoint
CREATE INDEX "bookings_trip_index" ON "bookings" USING btree ("trip_id","status");--> statement-breakpoint
CREATE INDEX "bookings_requests_due_index" ON "bookings" USING btree ("expires_at") WHERE "bookings"."status" = 'requested';--> statement-breakpoint
CREATE INDEX "bookings_payments_due_index" ON "bookings" USING btree ("payment_due_at") WHERE "bookings"."status" = 'accepted';