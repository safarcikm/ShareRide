ALTER TABLE "bookings" ADD COLUMN "co2_grams" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_co2_grams_check" CHECK ("bookings"."co2_grams" is null or "bookings"."co2_grams" >= 0);--> statement-breakpoint
-- Bookings completed before the CO2 figures get their grams at 150 g per car
-- km, the setting's starting value (spec 34; ADR 0054), from the stretches of
-- their part, so the first members' past rides count too.
UPDATE "bookings" SET "co2_grams" = "part"."grams"
FROM (
  SELECT "b"."id", round(sum("s"."distance_m") * 150 / 1000.0)::integer AS "grams"
  FROM "bookings" "b"
  JOIN "trip_stops" "f" ON "f"."id" = "b"."from_stop_id"
  JOIN "trip_stops" "t" ON "t"."id" = "b"."to_stop_id"
  JOIN "segments" "s" ON "s"."trip_id" = "b"."trip_id"
    AND "s"."position" >= "f"."position" AND "s"."position" < "t"."position"
  WHERE "b"."status" = 'completed' AND "b"."co2_grams" IS NULL
  GROUP BY "b"."id"
) AS "part"
WHERE "bookings"."id" = "part"."id";
