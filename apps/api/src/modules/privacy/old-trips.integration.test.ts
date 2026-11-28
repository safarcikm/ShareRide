import { Writable } from "node:stream";
import { myCo2Route } from "@shareride/contracts";
import { schema } from "@shareride/db";
import { defaultTripDaySettings, type HoldSubjectKind } from "@shareride/domain";
import { and, asc, eq, inArray, notExists } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLogger } from "../../logger.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";
import { ratingsOf } from "../people/ratings.ts";
import { createErasure } from "./erasure.ts";
import { anonymiseOldTrips } from "./old-trips.ts";
import { retentionSteps, runRetention } from "./retention.ts";

// Trips and bookings 3 years after the trip (spec 11, 3.7; plan 4.7, PR 9b):
// moved to the former member with their free text emptied, as an erasure
// would, unless a hold covers them. The sample trips at the test clock
// (Friday 13 November 2026, noon): Jón drives Hlemmur to Keflavík Airport on
// Saturday morning; Anna drives to Akureyri later.

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  await freshSampleTrips(api);
  const { db } = api.connection;
  await db.delete(schema.retentionRuns);
  await db.delete(schema.holds);
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  // The former member's cars made here, which no trip uses once the sample trips are back.
  await freshSampleTrips(api);
  const { db } = api.connection;
  await db
    .delete(schema.vehicles)
    .where(
      and(
        eq(schema.vehicles.ownerId, formerMemberId),
        notExists(
          db
            .select({ id: schema.trips.id })
            .from(schema.trips)
            .where(eq(schema.trips.vehicleId, schema.vehicles.id)),
        ),
      ),
    );
  await api.close();
});

const { newMember, rewind, driverOf, booked, paid } = bookingHelpers(() => api);
const { airport, north } = sampleTrip;
const day = 24 * 3600 * 1000;
const { formerMemberId } = schema;

/** A logger that keeps its lines in `lines`. */
function logger(lines: string[] = []) {
  return createLogger({
    level: "info",
    destination: new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    }),
  });
}

/** The clean-up once, at `now`; none of its rules may fail. */
async function run(now: Date) {
  const db = api.connection.db;
  const erasure = createErasure({
    db,
    clock: () => now,
    hasher: api.features.hasher,
    tripDaySettings: defaultTripDaySettings,
    logger: logger(),
  });
  const result = await runRetention({
    db,
    now,
    steps: retentionSteps({ db, erasure, logger: logger() }),
    logger: logger(),
  });
  expect(result.failedRules).toEqual([]);
  expect(result.failures).toBe(0);
  return result.counts.trips_and_bookings;
}

async function arrival(tripId: string) {
  const [trip] = await api.connection.db
    .select({ arrivesAt: schema.trips.arrivesAt })
    .from(schema.trips)
    .where(eq(schema.trips.id, tripId));
  if (trip?.arrivesAt === undefined || trip.arrivesAt === null) throw new Error("No arrival.");
  return trip.arrivesAt;
}

/** Three calendar years after the trip's last stop: the first moment it is due. */
async function threeYearsAfter(tripId: string) {
  const due = new Date(await arrival(tripId));
  due.setUTCFullYear(due.getUTCFullYear() + 3);
  return due;
}

async function hold(kind: HoldSubjectKind, id: string, endsAt: Date) {
  const operator = await api.signInOperator();
  const [row] = await api.connection.db
    .insert(schema.holds)
    .values({
      subjectType: kind,
      subjectId: id,
      reason: "Chargeback",
      endsAt,
      setBy: operator.userId,
    })
    .returning({ id: schema.holds.id });
  if (row === undefined) throw new Error("No hold.");
  return row.id;
}

/**
 * Jón's airport trip with everything a ride leaves: his note, Gunna's paid
 * booking with her message, both their "I'm here", a report with its notes,
 * and a change of car.
 */
async function rideWithEverything() {
  const { db } = api.connection;
  const jon = await driverOf(airport, "Jón");
  const gunna = await newMember("Gunna");
  const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
  await paid(gunna.accessToken, booking.id);
  const [trip] = await db
    .select({ vehicleId: schema.trips.vehicleId })
    .from(schema.trips)
    .where(eq(schema.trips.id, airport));
  if (trip?.vehicleId === undefined || trip.vehicleId === null) throw new Error("No car.");
  await db
    .update(schema.trips)
    .set({ note: "Two bags each at most" })
    .where(eq(schema.trips.id, airport));
  await db
    .update(schema.bookings)
    .set({ message: "I'll wait by the door" })
    .where(eq(schema.bookings.id, booking.id));
  const [first] = await db
    .select({ id: schema.tripStops.id })
    .from(schema.tripStops)
    .where(and(eq(schema.tripStops.tripId, airport), eq(schema.tripStops.position, 0)));
  if (first === undefined) throw new Error("No stop.");
  const at = await arrival(airport);
  await db.insert(schema.checkIns).values([
    { tripStopId: first.id, userId: jon.userId, bookingId: null, checkedInAt: at },
    { tripStopId: first.id, userId: gunna.userId, bookingId: booking.id, checkedInAt: at },
  ]);
  await db.insert(schema.disputes).values({
    bookingId: booking.id,
    kind: "no_show",
    raisedAt: at,
    note: "Waited ten minutes",
    answer: "contested",
    answeredAt: at,
    answerNote: "I was by the bus stop",
    outcome: "rode",
    decidedBy: "system",
    decidedAt: at,
    decisionNote: "Both were there",
  });
  await db.insert(schema.tripChanges).values({
    tripId: airport,
    kind: "vehicle",
    before: { vehicleId: trip.vehicleId, make: "Kia", model: "Ceed", colour: "blue" },
    after: { vehicleId: trip.vehicleId, make: "Kia", model: "Ceed", colour: "blue" },
    changedAt: at,
  });
  return { jon, gunna, bookingId: booking.id, carId: trip.vehicleId };
}

/**
 * Gunna's review of Jón and his of her, both shown; the operator hid his.
 * Returns them as stored, oldest first.
 */
async function reviewedEachOther(jonId: string, gunnaId: string, bookingId: string) {
  const at = await arrival(airport);
  const later = (minutes: number) => new Date(at.getTime() + minutes * 60 * 1000);
  await api.connection.db.insert(schema.reviews).values([
    {
      bookingId,
      authorId: gunnaId,
      subjectId: jonId,
      authorRole: "passenger",
      rating: 5,
      comment: "Smooth ride",
      revealedAt: later(30),
      createdAt: later(10),
    },
    {
      bookingId,
      authorId: jonId,
      subjectId: gunnaId,
      authorRole: "driver",
      rating: 2,
      comment: "Kept me waiting",
      revealedAt: later(30),
      hiddenAt: later(60),
      createdAt: later(30),
    },
  ]);
  return reviewsAbout(jonId, gunnaId);
}

/** The reviews about these people, oldest first. */
function reviewsAbout(...subjectIds: readonly string[]) {
  return api.connection.db
    .select()
    .from(schema.reviews)
    .where(inArray(schema.reviews.subjectId, [...subjectIds]))
    .orderBy(asc(schema.reviews.createdAt), asc(schema.reviews.id));
}

/** Whether a query of this database waits for a row lock. */
async function waitingOnALock() {
  const { rows } = await api.connection.pool.query<{ waiting: number }>(
    "select count(*)::int as waiting from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'",
  );
  return (rows[0]?.waiting ?? 0) > 0;
}

async function tripOf(tripId: string) {
  const [trip] = await api.connection.db
    .select()
    .from(schema.trips)
    .where(eq(schema.trips.id, tripId));
  if (trip === undefined) throw new Error("No trip.");
  return trip;
}

async function bookingOf(bookingId: string) {
  const [booking] = await api.connection.db
    .select()
    .from(schema.bookings)
    .where(eq(schema.bookings.id, bookingId));
  if (booking === undefined) throw new Error("No booking.");
  return booking;
}

async function carOf(carId: string) {
  const [car] = await api.connection.db
    .select()
    .from(schema.vehicles)
    .where(eq(schema.vehicles.id, carId));
  return car;
}

/** A blue Kia Ceed, as Jón's, owned by `ownerId`; removed by them, or not. */
async function newCar(ownerId: string, { removed }: { readonly removed: boolean }) {
  const [car] = await api.connection.db
    .insert(schema.vehicles)
    .values({
      ownerId,
      make: "Kia",
      model: "Ceed",
      colour: "blue",
      registration: ownerId === formerMemberId ? null : "AB123",
      removedAt: removed ? api.now() : null,
    })
    .returning({ id: schema.vehicles.id });
  if (car === undefined) throw new Error("No car.");
  return car.id;
}

describe("trips and bookings 3 years after the trip (spec 11, 3.7; plan 4.7)", () => {
  it("leaves a trip as it is until 3 years after its last stop", async () => {
    const { jon, bookingId } = await rideWithEverything();
    const due = await threeYearsAfter(airport);

    expect(await run(new Date(due.getTime() - 1))).toEqual({ erased: 0, anonymised: 0 });

    expect((await tripOf(airport)).driverId).toBe(jon.userId);
    expect((await bookingOf(bookingId)).message).toBe("I'll wait by the door");
  });

  it("moves the trip, its bookings, check-ins and reports to the former member, with their free text emptied", async () => {
    const { bookingId, carId } = await rideWithEverything();
    const { db } = api.connection;
    const before = {
      trip: await tripOf(airport),
      booking: await bookingOf(bookingId),
      car: await carOf(carId),
    };
    const stops = await db
      .select()
      .from(schema.tripStops)
      .where(eq(schema.tripStops.tripId, airport));
    const prices = await db
      .select()
      .from(schema.bookingSegmentPrices)
      .where(eq(schema.bookingSegmentPrices.bookingId, bookingId));
    const payments = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.bookingId, bookingId));

    // One trip and one booking.
    expect(await run(await threeYearsAfter(airport))).toEqual({ erased: 0, anonymised: 2 });

    const trip = await tripOf(airport);
    expect(trip).toEqual({
      ...before.trip,
      driverId: formerMemberId,
      vehicleId: expect.any(String) as unknown,
      note: "",
      cancelNote: "",
      updatedAt: expect.any(Date) as unknown,
    });
    // A car of the same make, model and colour, the former member's, with no plate.
    expect(trip.vehicleId).not.toBe(carId);
    expect(await carOf(trip.vehicleId ?? "")).toMatchObject({
      ownerId: formerMemberId,
      make: "Kia",
      model: "Ceed",
      colour: "blue",
      registration: null,
    });
    // The car he drove is its owner's as it was.
    expect(await carOf(carId)).toEqual(before.car);

    expect(await bookingOf(bookingId)).toEqual({
      ...before.booking,
      passengerId: formerMemberId,
      message: "",
      cancelNote: "",
      // A new retry key, so it never collides with another of the former member's.
      attemptKey: expect.any(String) as unknown,
      updatedAt: expect.any(Date) as unknown,
    });
    const checkIns = await db
      .select({ userId: schema.checkIns.userId })
      .from(schema.checkIns)
      .innerJoin(schema.tripStops, eq(schema.tripStops.id, schema.checkIns.tripStopId))
      .where(eq(schema.tripStops.tripId, airport));
    expect(checkIns).toEqual([{ userId: formerMemberId }, { userId: formerMemberId }]);
    const [dispute] = await db
      .select()
      .from(schema.disputes)
      .where(eq(schema.disputes.bookingId, bookingId));
    expect(dispute).toMatchObject({
      kind: "no_show",
      answer: "contested",
      outcome: "rode",
      note: "",
      answerNote: "",
      decisionNote: "",
    });
    // A change of car keeps what the passengers were told, not which car.
    const changes = await db
      .select({ before: schema.tripChanges.before, after: schema.tripChanges.after })
      .from(schema.tripChanges)
      .where(eq(schema.tripChanges.tripId, airport));
    expect(changes).toEqual([
      {
        before: { make: "Kia", model: "Ceed", colour: "blue" },
        after: { make: "Kia", model: "Ceed", colour: "blue" },
      },
    ]);
    // Stops, prices and the payment are as they were.
    expect(
      await db.select().from(schema.tripStops).where(eq(schema.tripStops.tripId, airport)),
    ).toEqual(stops);
    expect(
      await db
        .select()
        .from(schema.bookingSegmentPrices)
        .where(eq(schema.bookingSegmentPrices.bookingId, bookingId)),
    ).toEqual(prices);
    expect(
      await db.select().from(schema.payments).where(eq(schema.payments.bookingId, bookingId)),
    ).toEqual(payments);
  });

  it("keeps the trip's reviews for the people they are about, by nobody and on no ride (A51)", async () => {
    const { jon, gunna, bookingId } = await rideWithEverything();
    const written = await reviewedEachOther(jon.userId, gunna.userId, bookingId);
    const ratings = await ratingsOf(api.connection.db, [jon.userId, gunna.userId]);

    // One trip, one booking and two reviews.
    expect(await run(await threeYearsAfter(airport))).toEqual({ erased: 0, anonymised: 4 });

    expect(await reviewsAbout(jon.userId, gunna.userId)).toEqual(
      written.map((review) => ({
        ...review,
        authorId: formerMemberId,
        bookingId: null,
        updatedAt: expect.any(Date) as unknown,
      })),
    );
    // Stars, comments and when they were written and shown stay: so do the ratings.
    expect(await ratingsOf(api.connection.db, [jon.userId, gunna.userId])).toEqual(ratings);
  });

  it("unlinks the reviews of a trip made anonymous before reviews were (A51)", async () => {
    const { jon, gunna, bookingId } = await rideWithEverything();
    const written = await reviewedEachOther(jon.userId, gunna.userId, bookingId);
    const due = await threeYearsAfter(airport);
    await run(due);
    // As the clean-up left a trip before its reviews were unlinked too.
    for (const review of written) {
      await api.connection.db
        .update(schema.reviews)
        .set({ authorId: review.authorId, bookingId })
        .where(eq(schema.reviews.id, review.id));
    }

    // The trip once more, and its two reviews.
    expect(await run(due)).toEqual({ erased: 0, anonymised: 3 });

    expect(
      (await reviewsAbout(jon.userId, gunna.userId)).map(({ authorId, bookingId: ride }) => ({
        authorId,
        ride,
      })),
    ).toEqual([
      { authorId: formerMemberId, ride: null },
      { authorId: formerMemberId, ride: null },
    ]);
  });

  it("keeps such a trip's reviews while a hold covers a person they name", async () => {
    const { jon, gunna, bookingId } = await rideWithEverything();
    const written = await reviewedEachOther(jon.userId, gunna.userId, bookingId);
    const due = await threeYearsAfter(airport);
    await run(due);
    for (const review of written) {
      await api.connection.db
        .update(schema.reviews)
        .set({ authorId: review.authorId, bookingId })
        .where(eq(schema.reviews.id, review.id));
    }
    // The trip and booking name only the former member now; the reviews name Gunna.
    await hold("user", gunna.userId, new Date(due.getTime() + 30 * day));

    expect(await run(due)).toEqual({ erased: 0, anonymised: 0 });

    expect(
      (await reviewsAbout(jon.userId, gunna.userId)).map(({ authorId, bookingId: ride }) => ({
        authorId,
        ride,
      })),
    ).toEqual(written.map((review) => ({ authorId: review.authorId, ride: bookingId })));
  });

  it("leaves the driver's and passengers' later trips as they were", async () => {
    const { gunna } = await rideWithEverything();
    const later = await booked(gunna.accessToken, north, { fromStop: 0, toStop: 1 });
    expect((await arrival(north)).getTime()).toBeGreaterThan((await arrival(airport)).getTime());
    const before = { trip: await tripOf(north), booking: await bookingOf(later.id) };

    await run(await threeYearsAfter(airport));

    expect(await tripOf(north)).toEqual(before.trip);
    expect(await bookingOf(later.id)).toEqual(before.booking);
  });

  it.each([
    ["the trip", "trip"],
    ["the booking", "booking"],
    ["the driver", "driver"],
    ["the passenger", "passenger"],
  ] as const)(
    "keeps the trip as it is while %s is held, and lets go after",
    async (_name, which) => {
      const { jon, gunna, bookingId } = await rideWithEverything();
      const due = await threeYearsAfter(airport);
      const subject: [HoldSubjectKind, string] =
        which === "trip"
          ? ["trip", airport]
          : which === "booking"
            ? ["booking", bookingId]
            : ["user", which === "driver" ? jon.userId : gunna.userId];
      const held = await hold(...subject, new Date(due.getTime() + day));

      expect(await run(due)).toEqual({ erased: 0, anonymised: 0 });
      expect((await tripOf(airport)).driverId).toBe(jon.userId);
      expect((await bookingOf(bookingId)).passengerId).toBe(gunna.userId);

      await api.connection.db
        .update(schema.holds)
        .set({ endedAt: due })
        .where(eq(schema.holds.id, held));
      expect(await run(due)).toEqual({ erased: 0, anonymised: 2 });
      expect((await tripOf(airport)).driverId).toBe(formerMemberId);
    },
  );

  it("waits for a hold being set on the passenger, then keeps the trip", async () => {
    const { gunna, bookingId } = await rideWithEverything();
    const due = await threeYearsAfter(airport);
    const operator = await api.signInOperator();
    // As setting a hold does: the people it covers locked, then the hold saved.
    const client = await api.connection.pool.connect();
    try {
      await client.query("begin");
      await client.query("select id from users where id = $1 for share", [gunna.userId]);
      await client.query(
        "insert into holds (subject_type, subject_id, reason, ends_at, set_by) values ('user', $1, 'Claim', $2, $3)",
        [gunna.userId, new Date(due.getTime() + day), operator.userId],
      );
      // The rule finds the trip due, then waits for Gunna's row.
      const state = { settled: false };
      const running = anonymiseOldTrips(api.connection.db, due, logger()).finally(() => {
        state.settled = true;
      });
      while (!state.settled && !(await waitingOnALock())) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await client.query("commit");

      expect(await running).toEqual({ trips: 0, bookings: 0, reviews: 0, cars: 0, failed: 0 });
    } finally {
      client.release();
    }
    expect((await bookingOf(bookingId)).passengerId).toBe(gunna.userId);
  });

  it("keeps the whole trip while one of its passengers is held", async () => {
    const { bookingId } = await rideWithEverything();
    const sigga = await newMember("Sigga");
    const theirs = await booked(sigga.accessToken, airport, { fromStop: 0, toStop: 1 });
    const due = await threeYearsAfter(airport);
    await hold("user", sigga.userId, new Date(due.getTime() + day));

    expect(await run(due)).toEqual({ erased: 0, anonymised: 0 });

    expect((await bookingOf(bookingId)).message).toBe("I'll wait by the door");
    expect((await bookingOf(theirs.id)).passengerId).toBe(sigga.userId);
  });

  it("moves two passengers' bookings that share a retry key", async () => {
    const { bookingId } = await rideWithEverything();
    const sigga = await newMember("Sigga");
    const theirs = await booked(sigga.accessToken, airport, { fromStop: 0, toStop: 1 });
    const { db } = api.connection;
    // Each passenger's keys are their own, so two people can send the same.
    const [mine] = await db
      .select({ attemptKey: schema.bookings.attemptKey })
      .from(schema.bookings)
      .where(eq(schema.bookings.id, bookingId));
    await db
      .update(schema.bookings)
      .set({ attemptKey: mine?.attemptKey ?? "" })
      .where(eq(schema.bookings.id, theirs.id));

    expect(await run(await threeYearsAfter(airport))).toEqual({ erased: 0, anonymised: 3 });

    expect((await bookingOf(theirs.id)).passengerId).toBe(formerMemberId);
  });

  it("goes on with the other trips when one fails, and logs which", async () => {
    await rideWithEverything();
    const { pool } = api.connection;
    // Something the rule does not expect refuses to change the airport trip.
    await pool.query(`
      CREATE FUNCTION old_trips_test_refuse() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'refused'; END $$`);
    await pool.query(`
      CREATE TRIGGER old_trips_test_refuse BEFORE UPDATE ON trips FOR EACH ROW
      WHEN (old.id = '${airport}') EXECUTE FUNCTION old_trips_test_refuse()`);
    try {
      const lines: string[] = [];

      const counts = await anonymiseOldTrips(
        api.connection.db,
        await threeYearsAfter(north),
        logger(lines),
      );

      expect(counts).toMatchObject({ trips: 1, failed: 1 });
      expect((await tripOf(north)).driverId).toBe(formerMemberId);
      expect((await tripOf(airport)).driverId).not.toBe(formerMemberId);
      const failure = lines.find((line) => line.includes("trip anonymisation failed"));
      expect(failure).toContain(airport);
    } finally {
      await pool.query(`DROP TRIGGER old_trips_test_refuse ON trips`);
      await pool.query(`DROP FUNCTION old_trips_test_refuse`);
    }
  });

  it("is safe to run twice: the second run changes nothing", async () => {
    await rideWithEverything();
    const due = await threeYearsAfter(airport);
    await run(due);
    const trip = await tripOf(airport);
    const cars = await api.connection.db
      .select()
      .from(schema.vehicles)
      .orderBy(asc(schema.vehicles.id));

    expect(await run(due)).toEqual({ erased: 0, anonymised: 0 });

    expect(await tripOf(airport)).toEqual(trip);
    expect(
      await api.connection.db.select().from(schema.vehicles).orderBy(asc(schema.vehicles.id)),
    ).toEqual(cars);
  });

  it("uses one former member's car for trips in cars that look the same", async () => {
    await rideWithEverything();
    const { db } = api.connection;
    // Anna's trip, in a car like Jón's, ends before the airport trip is due.
    const anna = await tripOf(north);
    const lookAlike = await newCar(anna.driverId, { removed: true });
    await db.update(schema.trips).set({ vehicleId: lookAlike }).where(eq(schema.trips.id, north));

    await run(await threeYearsAfter(north));

    const used = await db
      .select({ vehicleId: schema.trips.vehicleId })
      .from(schema.trips)
      .where(inArray(schema.trips.id, [airport, north]));
    expect(new Set(used.map((trip) => trip.vehicleId)).size).toBe(1);
  });

  it("deletes a removed car once no trip uses it", async () => {
    await rideWithEverything();
    const { db } = api.connection;
    // Jón removed the car he drove to the airport in; it was kept for that trip.
    const removed = await newCar((await tripOf(airport)).driverId, { removed: true });
    await db.update(schema.trips).set({ vehicleId: removed }).where(eq(schema.trips.id, airport));

    expect(await run(await threeYearsAfter(airport))).toEqual({ erased: 1, anonymised: 2 });

    expect(await carOf(removed)).toBeUndefined();
  });

  it("keeps a removed car while a later trip still uses it", async () => {
    await rideWithEverything();
    const { db } = api.connection;
    const removed = await newCar((await tripOf(airport)).driverId, { removed: true });
    await db
      .update(schema.trips)
      .set({ vehicleId: removed })
      .where(inArray(schema.trips.id, [airport, north]));

    expect(await run(await threeYearsAfter(airport))).toEqual({ erased: 0, anonymised: 2 });

    expect((await tripOf(north)).vehicleId).toBe(removed);
    expect(await carOf(removed)).toMatchObject({ registration: "AB123" });
  });

  it("finishes a trip whose driver was erased: the passengers still named move too", async () => {
    const { bookingId } = await rideWithEverything();
    const { db } = api.connection;
    // As an erasure of Jón leaves it: his trip and car the former member's.
    const car = await newCar(formerMemberId, { removed: false });
    await db
      .update(schema.trips)
      .set({ driverId: formerMemberId, vehicleId: car, note: "" })
      .where(eq(schema.trips.id, airport));

    expect(await run(await threeYearsAfter(airport))).toEqual({ erased: 0, anonymised: 2 });

    expect((await bookingOf(bookingId)).passengerId).toBe(formerMemberId);
    expect((await tripOf(airport)).vehicleId).toBe(car);
  });
});

// The CO2 totals carried over (spec 34, 3.11; R34.9): a trip made anonymous
// no longer names its people, so before it moves, what each completed
// booking saved is added to its passenger's and its driver's carried
// totals, and a member's totals stay as they were.
describe("the CO2 totals carried over when a trip is made anonymous (spec 34, 3.11)", () => {
  /** A booking ended with the grams it kept, as the completion stores them. */
  async function completed(bookingId: string, grams: number) {
    await api.connection.db
      .update(schema.bookings)
      .set({ status: "completed", co2Grams: grams, completedAt: await arrival(airport) })
      .where(eq(schema.bookings.id, bookingId));
  }

  /** Jón drove Gunna, two seats, and Sigga on the airport trip; both rides ended. */
  async function ridesThatSaved() {
    const jon = await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const sigga = await newMember("Sigga");
    const gunnas = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 2, seats: 2 });
    await paid(gunna.accessToken, gunnas.id);
    const siggas = await booked(sigga.accessToken, airport, { fromStop: 2, toStop: 3 });
    await paid(sigga.accessToken, siggas.id);
    await completed(gunnas.id, 7_500);
    await completed(siggas.id, 3_000);
    return { jon, gunna, sigga, siggas };
  }

  async function totalsOf(member: Member) {
    const found = await api.client.call(myCo2Route, { accessToken: member.accessToken });
    if (!found.ok) throw new Error(found.error.code);
    return found.data;
  }

  async function carried() {
    return api.connection.db
      .select({
        userId: schema.co2Carried.userId,
        passengerGrams: schema.co2Carried.passengerGrams,
        passengerRides: schema.co2Carried.passengerRides,
        driverGrams: schema.co2Carried.driverGrams,
        driverRides: schema.co2Carried.driverRides,
        driverPassengers: schema.co2Carried.driverPassengers,
      })
      .from(schema.co2Carried)
      .orderBy(asc(schema.co2Carried.userId));
  }

  const anonymise = async () =>
    anonymiseOldTrips(api.connection.db, await threeYearsAfter(airport), logger());

  afterEach(async () => {
    await api.connection.db.delete(schema.co2Carried);
  });

  it("keeps each member's totals as they were, as a passenger and as a driver (Review Focus 4)", async () => {
    const { jon, gunna, sigga } = await ridesThatSaved();
    const before = await Promise.all([jon, gunna, sigga].map(totalsOf));
    expect(before).toEqual([
      { grams: 10_500, asPassenger: null, asDriver: { grams: 10_500, rides: 1, passengers: 2 } },
      { grams: 7_500, asPassenger: { grams: 7_500, rides: 1 }, asDriver: null },
      { grams: 3_000, asPassenger: { grams: 3_000, rides: 1 }, asDriver: null },
    ]);

    expect(await anonymise()).toMatchObject({ trips: 1, failed: 0 });

    expect((await tripOf(airport)).driverId).toBe(formerMemberId);
    expect(await Promise.all([jon, gunna, sigga].map(totalsOf))).toEqual(before);
    const none = { passengerGrams: 0, passengerRides: 0 };
    expect(await carried()).toEqual(
      [
        { userId: jon.userId, ...none, driverGrams: 10_500, driverRides: 1, driverPassengers: 2 },
        {
          userId: gunna.userId,
          passengerGrams: 7_500,
          passengerRides: 1,
          driverGrams: 0,
          driverRides: 0,
          driverPassengers: 0,
        },
        {
          userId: sigga.userId,
          passengerGrams: 3_000,
          passengerRides: 1,
          driverGrams: 0,
          driverRides: 0,
          driverPassengers: 0,
        },
      ].sort((a, b) => a.userId.localeCompare(b.userId)),
    );
  });

  it("carries nothing from a trip that fails, and carries it once when tried again", async () => {
    const { jon, gunna } = await ridesThatSaved();
    const before = await Promise.all([jon, gunna].map(totalsOf));
    const { pool } = api.connection;
    await pool.query(`
      CREATE FUNCTION old_trips_test_refuse() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'refused'; END $$`);
    await pool.query(`
      CREATE TRIGGER old_trips_test_refuse BEFORE UPDATE ON trips FOR EACH ROW
      WHEN (old.id = '${airport}') EXECUTE FUNCTION old_trips_test_refuse()`);
    try {
      expect(await anonymise()).toMatchObject({ trips: 0, failed: 1 });
    } finally {
      await pool.query(`DROP TRIGGER old_trips_test_refuse ON trips`);
      await pool.query(`DROP FUNCTION old_trips_test_refuse`);
    }
    expect(await carried()).toEqual([]);
    expect(await Promise.all([jon, gunna].map(totalsOf))).toEqual(before);

    expect(await anonymise()).toMatchObject({ trips: 1, failed: 0 });
    expect(await anonymise()).toMatchObject({ trips: 0, failed: 0 });
    expect(await Promise.all([jon, gunna].map(totalsOf))).toEqual(before);
    expect(await carried()).toHaveLength(3);
  });

  it("keeps only the month of a carry, so its time does not point at the trip (A51)", async () => {
    const { gunna } = await ridesThatSaved();
    const now = await threeYearsAfter(airport);
    await anonymise();

    const [row] = await api.connection.db
      .select({ createdAt: schema.co2Carried.createdAt, updatedAt: schema.co2Carried.updatedAt })
      .from(schema.co2Carried)
      .where(eq(schema.co2Carried.userId, gunna.userId));
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    expect(row).toEqual({ createdAt: month, updatedAt: month });
  });

  it("adds to what earlier trips carried over", async () => {
    const { jon, gunna } = await ridesThatSaved();
    await api.connection.db.insert(schema.co2Carried).values([
      { userId: jon.userId, driverGrams: 4_000, driverRides: 1, driverPassengers: 1 },
      { userId: gunna.userId, passengerGrams: 1_200, passengerRides: 1 },
    ]);
    const before = await Promise.all([jon, gunna].map(totalsOf));
    expect(before).toEqual([
      { grams: 14_500, asPassenger: null, asDriver: { grams: 14_500, rides: 2, passengers: 3 } },
      { grams: 8_700, asPassenger: { grams: 8_700, rides: 2 }, asDriver: null },
    ]);

    expect(await anonymise()).toMatchObject({ trips: 1, failed: 0 });

    expect(await Promise.all([jon, gunna].map(totalsOf))).toEqual(before);
    const rows = await carried();
    expect(rows.find((row) => row.userId === jon.userId)).toMatchObject({
      driverGrams: 14_500,
      driverRides: 2,
      driverPassengers: 3,
    });
    expect(rows.find((row) => row.userId === gunna.userId)).toMatchObject({
      passengerGrams: 8_700,
      passengerRides: 2,
    });
  });

  it("still counts an erased passenger's ride for the driver, before and after", async () => {
    const { jon, siggas } = await ridesThatSaved();
    // As Sigga's erasure leaves her booking: the former member's.
    await api.connection.db
      .update(schema.bookings)
      .set({ passengerId: formerMemberId, message: "" })
      .where(eq(schema.bookings.id, siggas.id));
    const driver = { grams: 10_500, rides: 1, passengers: 2 };
    expect((await totalsOf(jon)).asDriver).toEqual(driver);

    await anonymise();

    expect((await totalsOf(jon)).asDriver).toEqual(driver);
    expect((await carried()).map((row) => row.userId)).not.toContain(formerMemberId);
  });

  it("deletes the carried totals with the account", async () => {
    const { gunna } = await ridesThatSaved();
    await anonymise();
    expect((await carried()).map((row) => row.userId)).toContain(gunna.userId);
    const { db } = api.connection;
    await db
      .update(schema.users)
      .set({ deleteAfter: new Date(api.now().getTime() - 1000) })
      .where(eq(schema.users.id, gunna.userId));
    const erasure = createErasure({
      db,
      clock: () => api.now(),
      hasher: api.features.hasher,
      tripDaySettings: defaultTripDaySettings,
      logger: logger(),
    });

    expect(await erasure.eraseOne(gunna.userId)).toBe(true);

    expect((await carried()).map((row) => row.userId)).not.toContain(gunna.userId);
  });
});
