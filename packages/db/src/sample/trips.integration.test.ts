import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseConnection } from "../index.ts";
import {
  bookings,
  bookingSegmentPrices,
  segments,
  trips,
  tripStops,
  users,
} from "../schema/index.ts";
import { freshTestDatabase } from "../testing.ts";
import { sampleId, seedSampleMeetingPoints } from "./seed.ts";
import { sampleTrips, seedSampleTrips } from "./trips.ts";

describe("seedSampleTrips", () => {
  let connection: DatabaseConnection;
  const now = new Date("2026-11-14T12:00:00Z");

  beforeAll(async () => {
    connection = await freshTestDatabase();
    await seedSampleMeetingPoints(connection.db, now);
    await seedSampleTrips(connection.db, now);
  });

  afterAll(async () => {
    await connection.close();
  });

  it("publishes each sample trip in the days ahead, by drivers without phone numbers", async () => {
    const rows = await connection.db.select().from(trips);
    expect(rows).toHaveLength(sampleTrips.length);
    expect(rows.every((row) => row.sample && row.status === "published")).toBe(true);
    expect(rows.every((row) => (row.departsAt?.getTime() ?? 0) > now.getTime())).toBe(true);
    const drivers = await connection.db.select().from(users);
    expect(drivers.every((driver) => driver.phoneE164 === null)).toBe(true);
  });

  it("plans the times and prices of Reykjavík to Akureyri as a driver's would be", async () => {
    const id = sampleId("trip:anna-akureyri");
    const [trip] = await connection.db.select().from(trips).where(eq(trips.id, id));
    expect(trip).toMatchObject({ departsAt: new Date("2026-11-15T09:00:00Z"), capacity: 3 });
    const stops = await connection.db.select().from(tripStops).where(eq(tripStops.tripId, id));
    expect(stops.map((stop) => stop.meetingPointId)).toEqual(
      ["bsi", "borgarnes", "blonduos", "akureyri"].map((key) => sampleId(`point:${key}`)),
    );
    const prices = await connection.db.select().from(segments).where(eq(segments.tripId, id));
    expect(prices.map((segment) => segment.price)).toEqual([1100, 2600, 2100]);
  });

  it("replaces a sample trip someone has booked, with its test bookings", async () => {
    const { db } = connection;
    const id = sampleId("trip:anna-akureyri");
    const [passenger] = await db
      .insert(users)
      .values({ firstName: "Test", locale: "en" })
      .returning();
    const stops = await db
      .select()
      .from(tripStops)
      .where(eq(tripStops.tripId, id))
      .orderBy(tripStops.position);
    const [booking] = await db
      .insert(bookings)
      .values({
        tripId: id,
        passengerId: passenger?.id ?? "",
        fromStopId: stops[0]?.id ?? "",
        toStopId: stops[1]?.id ?? "",
        seats: 1,
        status: "confirmed",
        totalPrice: 1100,
        attemptKey: randomUUID(),
      })
      .returning();
    await db
      .insert(bookingSegmentPrices)
      .values({ bookingId: booking?.id ?? "", segmentPosition: 0, price: 1100 });
    await seedSampleTrips(db, now);
    expect(await db.select().from(bookings)).toEqual([]);
    expect(await db.select().from(trips).where(eq(trips.id, id))).toHaveLength(1);
  });

  it("moves the trips on, without adding more, each time it runs", async () => {
    const later = new Date("2026-11-20T12:00:00Z");
    await seedSampleTrips(connection.db, later);
    const rows = await connection.db.select().from(trips);
    expect(rows).toHaveLength(sampleTrips.length);
    const [trip] = rows.filter((row) => row.id === sampleId("trip:anna-akureyri"));
    expect(trip?.departsAt).toEqual(new Date("2026-11-21T09:00:00Z"));
  });
});
