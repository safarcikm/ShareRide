CREATE TABLE "co2_carried" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"passenger_grams" bigint DEFAULT 0 NOT NULL,
	"passenger_rides" integer DEFAULT 0 NOT NULL,
	"driver_grams" bigint DEFAULT 0 NOT NULL,
	"driver_rides" integer DEFAULT 0 NOT NULL,
	"driver_passengers" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "co2_carried_counts_check" CHECK ("co2_carried"."passenger_grams" >= 0 and "co2_carried"."passenger_rides" >= 0 and "co2_carried"."driver_grams" >= 0 and "co2_carried"."driver_rides" >= 0 and "co2_carried"."driver_passengers" >= 0)
);
--> statement-breakpoint
ALTER TABLE "co2_carried" ADD CONSTRAINT "co2_carried_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;