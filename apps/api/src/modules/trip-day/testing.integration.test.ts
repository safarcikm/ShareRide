import { schema } from "@shareride/db";
import { asc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  sampleTrip,
  seedForBookings,
} from "../bookings/testing.ts";
import { moveTripForTests } from "./testing.ts";

// The browser tests' way to bring a trip's day closer (milestone 7 plan,
// 4.2): one trip's times move, never the clock that other journeys share.

let api: TestApi;

const { airport, north } = sampleTrip;

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  await freshSampleTrips(api);
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, rewind, booked, paid } = bookingHelpers(() => api);

const minuteMs = 60_000;

async function timesOf(tripId: string) {
  const { db } = api.connection;
  const [trip] = await db
    .select({
      status: schema.trips.status,
      departsAt: schema.trips.departsAt,
      arrivesAt: schema.trips.arrivesAt,
    })
    .from(schema.trips)
    .where(eq(schema.trips.id, tripId));
  const stops = await db
    .select({ plannedAt: schema.tripStops.plannedAt })
    .from(schema.tripStops)
    .where(eq(schema.tripStops.tripId, tripId))
    .orderBy(asc(schema.tripStops.position));
  if (trip === undefined || trip.departsAt === null || trip.arrivesAt === null) {
    throw new Error("No such trip.");
  }
  return {
    status: trip.status,
    departsAt: trip.departsAt,
    arrivesAt: trip.arrivesAt,
    stops: stops.map((stop) => stop.plannedAt?.getTime() ?? 0),
  };
}

describe("moving one trip's times for the browser tests", () => {
  it("puts its first stop the given minutes from now, every stop with it, and leaves other trips alone", async () => {
    const before = await timesOf(airport);
    const north0 = await timesOf(north);
    const gunna = await newMember("Gunna");
    const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 3 });
    await paid(gunna.accessToken, booking.id);

    await moveTripForTests(api.connection.db, airport, 10, api.now());

    const after = await timesOf(airport);
    const first = api.now().getTime() + 10 * minuteMs;
    const by = first - (before.stops[0] ?? 0);
    expect(after.stops).toEqual(before.stops.map((time) => time + by));
    expect(after.departsAt.getTime()).toBe(first);
    expect(after.arrivesAt.getTime()).toBe(before.arrivesAt.getTime() + by);
    expect(await timesOf(north)).toEqual(north0);
    // As if booked at the new time: no "moved far" offer (R6.3).
    const [row] = await api.connection.db
      .select({ departsAtWhenBooked: schema.bookings.departsAtWhenBooked })
      .from(schema.bookings)
      .where(eq(schema.bookings.id, booking.id));
    expect(row?.departsAtWhenBooked?.getTime()).toBe(first);
  });

  it("runs the trip day job, so a trip moved into the past has departed", async () => {
    await moveTripForTests(api.connection.db, airport, -5, api.now());
    expect((await timesOf(airport)).status).toBe("departed");
  });
});
