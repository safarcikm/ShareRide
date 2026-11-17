ALTER TABLE "bookings" ADD COLUMN "excused_by_reason" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "overruled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "overrule_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "excused_by_reason" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "overruled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "overrule_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_overrule_note_check" CHECK (char_length("bookings"."overrule_note") <= 500);--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_overrule_note_check" CHECK (char_length("trips"."overrule_note") <= 500);