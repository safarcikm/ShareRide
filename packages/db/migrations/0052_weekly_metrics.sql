CREATE TABLE "weekly_metrics" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"corridor_id" uuid,
	"iso_year" integer NOT NULL,
	"iso_week" integer NOT NULL,
	"metric" text NOT NULL,
	"numerator" bigint NOT NULL,
	"denominator" bigint,
	"computed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_metrics_week_unique" UNIQUE NULLS NOT DISTINCT("corridor_id","iso_year","iso_week","metric"),
	CONSTRAINT "weekly_metrics_metric_check" CHECK ("weekly_metrics"."metric" in ('searches', 'searches_with_result', 'requests_per_search_with_result', 'trips_posted', 'seats_offered', 'bookings_confirmed', 'seats_booked', 'seat_fill', 'driver_cancellations', 'passenger_late_cancellations', 'repeat_passengers', 'reports_per_trip', 'report_answer_minutes', 'reports_answered_late', 'money_paid', 'money_refunded', 'active_drivers', 'active_passengers')),
	CONSTRAINT "weekly_metrics_week_check" CHECK ("weekly_metrics"."iso_week" between 1 and 53),
	CONSTRAINT "weekly_metrics_values_check" CHECK ("weekly_metrics"."numerator" >= 0 and ("weekly_metrics"."denominator" is null or "weekly_metrics"."denominator" >= 0))
);
--> statement-breakpoint
ALTER TABLE "weekly_metrics" ADD CONSTRAINT "weekly_metrics_corridor_id_corridors_id_fk" FOREIGN KEY ("corridor_id") REFERENCES "public"."corridors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "weekly_metrics_week_index" ON "weekly_metrics" USING btree ("iso_year","iso_week");