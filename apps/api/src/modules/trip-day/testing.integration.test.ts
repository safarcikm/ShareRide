import { schema } from "@shareride/db";
import { asc, eq, sql, type SQL } from "drizzle-orm";
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

/**
 * Another transaction that takes `lock` and keeps it until `release`:
 * `locked` settles once it has it.
 */
function holding(lock: SQL) {
  let release = () => {};
  const until = new Promise<void>((resolve) => {
    release = resolve;
  });
  let taken = () => {};
  const locked = new Promise<void>((resolve) => {
    taken = resolve;
  });
  const done = api.connection.db.transaction(async (tx) => {
    await tx.execute(lock);
    taken();
    await until;
  });
  return {
    locked,
    release: async () => {
      release();
      await done;
    },
  };
}

/** Waits until `count` transactions on this database wait for a lock. */
async function waitingForALock(count: number) {
  for (let tries = 0; tries < 200; tries += 1) {
    const { rows } = await api.connection.db.execute<{ waiting: number }>(
      sql`select count(*)::int as waiting from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'`,
    );
    if ((rows[0]?.waiting ?? 0) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Fewer than ${String(count)} transactions wait for a lock.`);
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

  it("completes a trip that another transaction holds the moment its times have moved", async () => {
    // The test API has no next run of the job, and its notification worker
    // holds a trip for a moment whenever it writes that trip's
    // notifications: a row that points at a trip shares the trip's key. A
    // seat confirmed just before the move is such a moment.
    const gunna = await newMember("Gunna");
    const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 3 });
    await paid(gunna.accessToken, booking.id);
    const { db } = api.connection;
    // The move takes the trip and then stops at its stops, held here.
    const stops = holding(
      sql`select 1 from ${schema.tripStops} where ${schema.tripStops.tripId} = ${airport} for update`,
    );
    await stops.locked;
    const moving = moveTripForTests(db, airport, -36 * 60, api.now());
    await waitingForALock(1);
    // The worker's write waits for the move, and has the trip as soon as the move is stored.
    const worker = holding(
      sql`select 1 from ${schema.trips} where ${schema.trips.id} = ${airport} for key share`,
    );
    try {
      await waitingForALock(2);
      await stops.release();
      await moving;
      await worker.locked;

      expect((await timesOf(airport)).status).toBe("completed");
      const [row] = await db
        .select({ status: schema.bookings.status })
        .from(schema.bookings)
        .where(eq(schema.bookings.id, booking.id));
      expect(row?.status).toBe("completed");
    } finally {
      await stops.release();
      await worker.release();
    }
  });

  it("moves the trip's check-ins and reports with it, and lets a report nobody answered in time stand", async () => {
    const gunna = await newMember("Gunna");
    const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
    await paid(gunna.accessToken, booking.id);
    await moveTripForTests(api.connection.db, airport, -15, api.now());
    const { db } = api.connection;
    const [first] = await db
      .select({ id: schema.tripStops.id })
      .from(schema.tripStops)
      .where(eq(schema.tripStops.tripId, airport))
      .orderBy(asc(schema.tripStops.position));
    if (first === undefined) throw new Error("No stops.");
    const now = api.now();
    await db.insert(schema.checkIns).values({
      tripStopId: first.id,
      userId: gunna.userId,
      bookingId: booking.id,
      checkedInAt: now,
    });
    await db
      .insert(schema.disputes)
      .values({ bookingId: booking.id, kind: "driver_absent", raisedAt: now });
    const before = await timesOf(airport);

    // A day and a half back: the driver's 24 hours to answer have passed.
    await moveTripForTests(db, airport, -36 * 60, now);

    const by = (await timesOf(airport)).departsAt.getTime() - before.departsAt.getTime();
    const [checkIn] = await db
      .select({ at: schema.checkIns.checkedInAt })
      .from(schema.checkIns)
      .where(eq(schema.checkIns.bookingId, booking.id));
    expect(checkIn?.at.getTime()).toBe(now.getTime() + by);
    const [dispute] = await db
      .select()
      .from(schema.disputes)
      .where(eq(schema.disputes.bookingId, booking.id));
    expect(dispute).toMatchObject({ outcome: "stands", decidedBy: "system" });
    expect(dispute?.raisedAt.getTime()).toBe(now.getTime() + by);
    const [row] = await db
      .select({ status: schema.bookings.status, reason: schema.bookings.cancelReason })
      .from(schema.bookings)
      .where(eq(schema.bookings.id, booking.id));
    expect(row).toEqual({ status: "cancelled", reason: "driver_absent" });
  });
});
