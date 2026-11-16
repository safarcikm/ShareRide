import {
  bookingRoute,
  messageAllPassengersRoute,
  myBookingsRoute,
  myTripsRoute,
  tripBookingsRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { defaultTripDaySettings as settings } from "@shareride/domain";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import { lockTrip } from "../bookings/index.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";
import { moveTripsOn } from "./completion.ts";

// The sample trips at the test clock (Friday 13 November 2026, noon): Jón
// drives Hlemmur to Keflavík Airport on Saturday at 05:30 (2 seats,
// instant), the first of them to leave; Anna drives BSÍ to Hof, Akureyri on
// Saturday at 09:00.

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

const { newMember, later, rewind, driverOf, booked, paid, occupancy, heldByBookings } =
  bookingHelpers(() => api);

const hourMs = 3_600_000;
const run = () => moveTripsOn(api.connection.db, api.now(), settings);

async function trip(id: string) {
  const [row] = await api.connection.db
    .select({
      status: schema.trips.status,
      departsAt: schema.trips.departsAt,
      arrivesAt: schema.trips.arrivesAt,
      completedAt: schema.trips.completedAt,
    })
    .from(schema.trips)
    .where(eq(schema.trips.id, id));
  if (row === undefined || row.departsAt === null || row.arrivesAt === null) {
    throw new Error("No such trip.");
  }
  return { ...row, departsAt: row.departsAt, arrivesAt: row.arrivesAt };
}

async function booking(id: string) {
  const [row] = await api.connection.db
    .select({ status: schema.bookings.status, completedAt: schema.bookings.completedAt })
    .from(schema.bookings)
    .where(eq(schema.bookings.id, id));
  return row;
}

/** Moves the clock to `at`, give or take some seconds, refreshing the members' tokens. */
async function until(at: Date, seconds: number, ...members: Member[]) {
  await later(Math.round((at.getTime() - api.now().getTime()) / 1000) + seconds, ...members);
}

/** A confirmed booking of Gunna's on the airport trip, all the way. */
async function gunnasRide() {
  const gunna = await newMember("Gunna");
  const ride = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 3 });
  await paid(gunna.accessToken, ride.id);
  return { gunna, ride };
}

describe("trips depart and complete on their own (spec 8, 3.6; R8.1, R8.2)", () => {
  it("departs a published trip at its first stop's planned time, once", async () => {
    const { departsAt } = await trip(airport);
    await until(departsAt, -1);
    expect(await run()).toEqual({ departed: 0, completed: 0 });
    expect((await trip(airport)).status).toBe("published");

    await later(1);
    expect(await run()).toEqual({ departed: 1, completed: 0 });
    expect((await trip(airport)).status).toBe("departed");
    expect(await run()).toEqual({ departed: 0, completed: 0 });
    expect((await trip(north)).status).toBe("published");
  });

  it("completes it 2 hours after its last stop with its confirmed bookings, and frees their seats", async () => {
    const { ride } = await gunnasRide();
    const sigga = await newMember("Sigga");
    const unpaid = await booked(sigga.accessToken, airport, { fromStop: 1, toStop: 2 });
    const { arrivesAt } = await trip(airport);
    const completedAt = new Date(arrivesAt.getTime() + 2 * hourMs);

    await until(completedAt, -1);
    expect(await run()).toEqual({ departed: 1, completed: 0 });
    expect(await booking(ride.id)).toEqual({ status: "confirmed", completedAt: null });

    await later(1);
    expect(await run()).toEqual({ departed: 0, completed: 1 });
    expect(await trip(airport)).toMatchObject({ status: "completed", completedAt });
    expect(await booking(ride.id)).toEqual({ status: "completed", completedAt });
    // Its deadline passed long ago: stored as expired first, never completed.
    expect(await booking(unpaid.id)).toMatchObject({ status: "expired", completedAt: null });
    // Rule S1: a completed booking holds no seats.
    expect(await occupancy(airport)).toEqual([0, 0, 0]);
    expect(await occupancy(airport)).toEqual(await heldByBookings(airport));
    expect(await run()).toEqual({ departed: 0, completed: 0 });
  });

  it("completes a trip it never saw depart, at the time the rule says, when it runs late", async () => {
    const { ride } = await gunnasRide();
    const { arrivesAt } = await trip(airport);
    const completedAt = new Date(arrivesAt.getTime() + 2 * hourMs);
    await until(completedAt, 3 * 3600);
    // Anna's trip north has left by then too.
    expect(await run()).toEqual({ departed: 1, completed: 1 });
    expect(await trip(airport)).toMatchObject({ status: "completed", completedAt });
    expect(await booking(ride.id)).toEqual({ status: "completed", completedAt });
  });

  it("leaves cancelled trips and drafts as they are", async () => {
    const { db } = api.connection;
    await db
      .update(schema.trips)
      .set({ status: "cancelled", cancelledAt: api.now(), cancelReason: "illness" })
      .where(eq(schema.trips.id, airport));
    await db.update(schema.trips).set({ status: "draft" }).where(eq(schema.trips.id, north));
    await until((await trip(north)).arrivesAt, 3 * 3600);
    await run();
    expect((await trip(airport)).status).toBe("cancelled");
    expect((await trip(north)).status).toBe("draft");
  });

  it("leaves a trip that is being changed for the next run, without waiting", async () => {
    const { departsAt } = await trip(airport);
    await until(departsAt, 0);
    const { db } = api.connection;
    const locked = Promise.withResolvers<undefined>();
    const released = Promise.withResolvers<undefined>();
    const changing = db.transaction(async (tx) => {
      await lockTrip(tx, airport);
      locked.resolve(undefined);
      await released.promise;
    });
    await locked.promise;
    expect(await run()).toEqual({ departed: 0, completed: 0 });
    released.resolve(undefined);
    await changing;
    expect(await run()).toEqual({ departed: 1, completed: 0 });
  });
});

describe("rides that left and ended (spec 16, section 6)", () => {
  it("keeps a departed trip in the driver's upcoming trips until its last stop, then in the past ones", async () => {
    const jon = await driverOf(airport, "Jón");
    const myTrips = async (when: "upcoming" | "past") => {
      const result = await api.client.call(myTripsRoute, {
        accessToken: jon.accessToken,
        query: { when },
      });
      if (!result.ok) throw new Error(result.error.code);
      return result.data.trips.filter((one) => one.id === airport).map((one) => one.status);
    };
    const { departsAt, arrivesAt } = await trip(airport);

    await until(departsAt, 0, jon);
    await run();
    expect(await myTrips("upcoming")).toEqual(["departed"]);
    expect(await myTrips("past")).toEqual([]);

    await until(arrivesAt, 0, jon);
    expect(await myTrips("upcoming")).toEqual([]);
    expect(await myTrips("past")).toEqual(["departed"]);

    await until(arrivesAt, 2 * 3600, jon);
    await run();
    expect(await myTrips("past")).toEqual(["completed"]);
  });

  it("shows the passenger's completed booking among their past rides", async () => {
    const { gunna, ride } = await gunnasRide();
    await until((await trip(airport)).arrivesAt, 2 * 3600, gunna);
    await run();
    const past = await api.client.call(myBookingsRoute, {
      accessToken: gunna.accessToken,
      query: { when: "past" },
    });
    if (!past.ok) throw new Error(past.error.code);
    expect(past.data.bookings.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: ride.id, status: "completed" },
    ]);
  });

  it("keeps the ride's meeting details for both sides once it completed (R5.12)", async () => {
    const jon = await driverOf(airport, "Jón");
    const { gunna, ride } = await gunnasRide();
    await until((await trip(airport)).arrivesAt, 2 * 3600, jon, gunna);
    await run();
    const seen = await api.client.call(bookingRoute, {
      accessToken: gunna.accessToken,
      params: { id: ride.id },
    });
    if (!seen.ok) throw new Error(seen.error.code);
    expect(seen.data.status).toBe("completed");
    expect(seen.data.confirmed).not.toBeNull();
    const onTrip = await api.client.call(tripBookingsRoute, {
      accessToken: jon.accessToken,
      params: { id: airport },
    });
    if (!onTrip.ok) throw new Error(onTrip.error.code);
    expect(onTrip.data.bookings.map(({ status, confirmed }) => ({ status, confirmed }))).toEqual([
      { status: "completed", confirmed: seen.data.confirmed },
    ]);
  });

  it("still shows the seats its passengers took once their bookings completed and freed them", async () => {
    const jon = await driverOf(airport, "Jón");
    await gunnasRide();
    const sigga = await newMember("Sigga");
    const short = await booked(sigga.accessToken, airport, { fromStop: 1, toStop: 2 });
    await paid(sigga.accessToken, short.id);
    await until((await trip(airport)).arrivesAt, 2 * 3600, jon);
    await run();
    expect(await occupancy(airport)).toEqual([0, 0, 0]);
    const listed = await api.client.call(myTripsRoute, {
      accessToken: jon.accessToken,
      query: { when: "past" },
    });
    if (!listed.ok) throw new Error(listed.error.code);
    const past = listed.data.trips.find((one) => one.id === airport);
    expect(past?.segments.map(({ seatsTaken }) => seatsTaken)).toEqual([1, 2, 1]);
    const onTrip = await api.client.call(tripBookingsRoute, {
      accessToken: jon.accessToken,
      params: { id: airport },
    });
    if (!onTrip.ok) throw new Error(onTrip.error.code);
    expect(onTrip.data.segments.map(({ occupancy: taken }) => taken)).toEqual([1, 2, 1]);
  });

  it("still lets the driver write to all passengers once their bookings completed (R7.1, R7.4)", async () => {
    const jon = await driverOf(airport, "Jón");
    await gunnasRide();
    await until((await trip(airport)).arrivesAt, 3 * 3600, jon);
    await run();
    const sent = await api.client.call(messageAllPassengersRoute, {
      accessToken: jon.accessToken,
      params: { id: airport },
      body: { clientId: randomUUID(), text: "Someone left a scarf in the car." },
    });
    expect(sent).toMatchObject({ ok: true, data: { sent: 1 } });
  });
});
