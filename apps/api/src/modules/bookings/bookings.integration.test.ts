import { randomUUID } from "node:crypto";
import {
  acceptRequestRoute,
  bookingRoute,
  bookTripRoute,
  createTripRoute,
  declineRequestRoute,
  myBookingsRoute,
  myTripsRoute,
  tripBookingsRoute,
  tripSearchRoute,
  withdrawRequestRoute,
  type BookTripBody,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { sampleId } from "@shareride/db/seed";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import { bookingHelpers, freshSampleTrips, hours, sampleTrip, seedForBookings } from "./testing.ts";

// The sample trips at the test clock (Friday 13 November 2026, noon): Anna
// drives BSÍ to Hof, Akureyri on Saturday at 09:00 through N1 Borgarnes and
// Olís Blönduós (3 seats, approval); Jón drives Hlemmur to Keflavík Airport
// on Saturday at 05:30 (2 seats) and Selfoss to Vík on Sunday (2 seats),
// both with instant booking.

let api: TestApi;

const { north, airport, vik } = sampleTrip;

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  // Every test starts from the sample trips with no bookings.
  await freshSampleTrips(api);
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, later, rewind, driverOf, details, book, booked, occupancy, heldByBookings } =
  bookingHelpers(() => api);

describe("POST /v1/trips/{id}/bookings (spec 5, 3.2)", () => {
  it("requests seats on an approval trip and holds them until the driver answers", async () => {
    const jon = await newMember("Jón");
    const shown = await details(north, 1, 2);
    const result = await book(jon.accessToken, north, {
      fromStop: 1,
      toStop: 2,
      message: "One big suitcase",
    });
    expect(result).toMatchObject({ ok: true, status: 201 });
    if (!result.ok) return;
    const borgarnesAt = new Date(shown.stops[1]?.plannedAt ?? "");
    expect(result.data).toMatchObject({
      status: "requested",
      viewer: "passenger",
      trip: { id: north, bookingMode: "approval" },
      board: { position: 1, meetingPoint: { id: sampleId("point:borgarnes") } },
      alight: { position: 2, meetingPoint: { id: sampleId("point:blonduos") } },
      seats: 1,
      total: shown.part.total,
      message: "One big suitcase",
      driver: { firstName: "Anna" },
      passenger: { firstName: "Jón" },
      car: { make: "Toyota", model: "Yaris", colour: "white" },
      paymentDueAt: null,
      confirmed: null,
    });
    // 12 hours after the request, before 2 hours ahead of Borgarnes (R5.5).
    expect(result.data.requestExpiresAt).toBe(
      new Date(
        Math.min(api.now().getTime() + hours(12) * 1000, borgarnesAt.getTime() - hours(2) * 1000),
      ).toISOString(),
    );
    expect(await occupancy(north)).toEqual([0, 1, 0]);
    const after = await details(north, 1, 2, 1, jon.accessToken);
    expect(after.part.freeSeats).toBe(2);
    expect(after.myBooking).toEqual({ id: result.data.id, status: "requested" });
    // Nothing here a passenger should not see.
    expect(JSON.stringify(result.data)).not.toMatch(/phone|declineReason|registration/);
  });

  it("books an instant trip, which waits 30 minutes for payment (rule M1)", async () => {
    const gunna = await newMember("Gunna");
    const result = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 3, seats: 2 });
    expect(result).toMatchObject({
      status: "accepted",
      requestExpiresAt: null,
      paymentDueAt: new Date(api.now().getTime() + 30 * 60_000).toISOString(),
    });
    expect(await occupancy(airport)).toEqual([2, 2, 2]);
  });

  it("confirms a free instant booking at once (R5.11)", async () => {
    await api.connection.db
      .update(schema.segments)
      .set({ price: 0 })
      .where(eq(schema.segments.tripId, vik));
    const gunna = await newMember("Gunna");
    const result = await booked(gunna.accessToken, vik, { fromStop: 0, toStop: 3 });
    expect(result).toMatchObject({
      status: "confirmed",
      total: { amount: 0, currency: "ISK" },
      paymentDueAt: null,
      confirmed: { registration: null, whereToStand: expect.any(Object) as unknown },
    });
  });

  it("gives the same booking for the same attempt key, and books once (R5.4)", async () => {
    const jon = await newMember("Jón");
    const shown = await details(north, 0, 3);
    const body = {
      fromStop: 0,
      toStop: 3,
      seats: 1,
      total: shown.part.total,
      message: "",
      attemptKey: randomUUID(),
    };
    const call = () =>
      api.client.call(bookTripRoute, { accessToken: jon.accessToken, params: { id: north }, body });
    const first = await call();
    const again = await call();
    // Even with something else changed, the key names the attempt.
    const changed = await api.client.call(bookTripRoute, {
      accessToken: jon.accessToken,
      params: { id: north },
      body: { ...body, seats: 2 },
    });
    expect(first).toMatchObject({ status: 201 });
    expect(again).toMatchObject({ status: 200 });
    expect(changed).toMatchObject({ status: 200 });
    if (!first.ok || !again.ok || !changed.ok) return;
    expect(again.data.id).toBe(first.data.id);
    expect(changed.data).toMatchObject({ id: first.data.id, seats: 1 });
    expect(await occupancy(north)).toEqual([1, 1, 1]);
  });

  it("gives exactly one of two passengers the last seat when they book at the same moment (R5.2)", async () => {
    const first = await newMember("Jón");
    const second = await newMember("Gunna");
    const third = await newMember("Siggi");
    await booked(first.accessToken, airport, { fromStop: 0, toStop: 3 });
    const [one, two] = await Promise.all([
      book(second.accessToken, airport, { fromStop: 1, toStop: 3 }),
      book(third.accessToken, airport, { fromStop: 0, toStop: 2 }),
    ]);
    const statuses = [one.status, two.status].sort();
    expect(statuses).toEqual([201, 409]);
    const loser = one.ok ? two : one;
    expect(loser).toMatchObject({ error: { code: "seats_taken", freeSeats: 0 } });
    expect(Math.max(...(await occupancy(airport)))).toBe(2);
  });

  it("says how many seats are free when too few are", async () => {
    const jon = await newMember("Jón");
    const gunna = await newMember("Gunna");
    await booked(jon.accessToken, north, { fromStop: 1, toStop: 2, seats: 2 });
    const shown = await details(north, 0, 3, 2);
    const result = await api.client.call(bookTripRoute, {
      accessToken: gunna.accessToken,
      params: { id: north },
      body: { fromStop: 0, toStop: 3, seats: 2, total: shown.part.total, attemptKey: randomUUID() },
    });
    expect(result).toMatchObject({ status: 409, error: { code: "seats_taken", freeSeats: 1 } });
  });

  it("asks again when the price is not the one shown (R5.3)", async () => {
    const jon = await newMember("Jón");
    const shown = await details(north, 1, 2);
    const result = await book(jon.accessToken, north, {
      fromStop: 1,
      toStop: 2,
      total: { amount: shown.part.total.amount - 100, currency: "ISK" },
    });
    expect(result).toMatchObject({
      status: 409,
      error: { code: "price_changed", total: shown.part.total },
    });
    expect(await occupancy(north)).toEqual([0, 0, 0]);
  });

  it("refuses a booking that overlaps one the passenger holds (R5.10)", async () => {
    const jon = await newMember("Jón");
    await booked(jon.accessToken, north, { fromStop: 0, toStop: 2 });
    expect(await book(jon.accessToken, north, { fromStop: 1, toStop: 3 })).toMatchObject({
      status: 409,
      error: { code: "overlapping_booking" },
    });
  });

  it("refuses a booking on another trip at the same time (R5.10)", async () => {
    // The airport trip four hours later: Hlemmur at 09:30, while Anna drives north.
    await api.connection.db
      .update(schema.tripStops)
      .set({ plannedAt: sql`${schema.tripStops.plannedAt} + interval '4 hours'` })
      .where(eq(schema.tripStops.tripId, airport));
    const jon = await newMember("Jón");
    await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    expect(await book(jon.accessToken, airport, { fromStop: 0, toStop: 3 })).toMatchObject({
      status: 409,
      error: { code: "overlapping_booking" },
    });
  });

  it("refuses the driver's own trip, a closed or unknown trip and an incomplete account", async () => {
    const anna = await driverOf(north);
    expect(await book(anna.accessToken, north, { fromStop: 0, toStop: 1 })).toMatchObject({
      status: 403,
      error: { code: "own_trip" },
    });
    const visitor = await newMember("Óli", { complete: false });
    expect(await book(visitor.accessToken, airport, { fromStop: 0, toStop: 1 })).toMatchObject({
      status: 403,
      error: { code: "account_incomplete" },
    });
    const jon = await newMember("Jón");
    const unknown = await api.client.call(bookTripRoute, {
      accessToken: jon.accessToken,
      params: { id: sampleId("trip:nowhere") },
      body: {
        fromStop: 0,
        toStop: 1,
        seats: 1,
        total: { amount: 0, currency: "ISK" },
        attemptKey: randomUUID(),
      },
    });
    expect(unknown).toMatchObject({ status: 404, error: { code: "not_found" } });
    // The airport trip leaves Hlemmur at 05:30 on Saturday.
    await later(hours(17) + 20 * 60, jon);
    expect(await book(jon.accessToken, airport, { fromStop: 0, toStop: 3 })).toMatchObject({
      status: 409,
      error: { code: "booking_closed" },
    });
  });

  it("checks the part, the seats and the message", async () => {
    const jon = await newMember("Jón");
    const refused = (body: Partial<BookTripBody>, id = north) =>
      api.client.call(bookTripRoute, {
        accessToken: jon.accessToken,
        params: { id },
        body: {
          fromStop: 1,
          toStop: 2,
          seats: 1,
          total: { amount: 0, currency: "ISK" },
          attemptKey: randomUUID(),
          ...body,
        },
      });
    expect(await refused({ fromStop: 2, toStop: 1 })).toMatchObject({
      status: 400,
      error: { code: "validation_failed", details: [{ path: "toStop", issue: "invalid_part" }] },
    });
    expect(await refused({ toStop: 9 })).toMatchObject({
      status: 400,
      error: { details: [{ path: "toStop", issue: "invalid_part" }] },
    });
    expect(await refused({ message: "a".repeat(301) })).toMatchObject({
      status: 400,
      error: { details: [{ path: "message", issue: "too_long" }] },
    });
    expect(await refused({ message: "Hringdu í 555 1234" })).toMatchObject({
      status: 400,
      error: { details: [{ path: "message", issue: "contact_details" }] },
    });
    expect(await refused({ message: "Hi", fromStop: 0, toStop: 1 }, airport)).toMatchObject({
      status: 400,
      error: { details: [{ path: "message", issue: "not_allowed" }] },
    });
  });

  it("frees a request's seats once its deadline passes, before any job runs (R5.5)", async () => {
    const jon = await newMember("Jón");
    const gunna = await newMember("Gunna");
    const request = await booked(jon.accessToken, north, { fromStop: 0, toStop: 3 });
    expect(
      await book(gunna.accessToken, north, { fromStop: 0, toStop: 3, seats: 3 }),
    ).toMatchObject({
      status: 409,
    });
    await later(hours(12), jon, gunna);
    expect(
      await book(gunna.accessToken, north, { fromStop: 0, toStop: 3, seats: 3 }),
    ).toMatchObject({ status: 201 });
    const old = await api.client.call(bookingRoute, {
      accessToken: jon.accessToken,
      params: { id: request.id },
    });
    // It keeps the deadline that passed, so the app can say the driver didn't answer.
    expect(old).toMatchObject({
      ok: true,
      data: { status: "expired", requestExpiresAt: request.requestExpiresAt, paymentDueAt: null },
    });
    expect(await occupancy(north)).toEqual([3, 3, 3]);
  });

  it("shows the seats free again in search and trip details once a deadline passes", async () => {
    const anna = await driverOf(north);
    const jon = await newMember("Jón");
    const gunna = await newMember("Gunna");
    const search = async () => {
      const found = await api.client.call(tripSearchRoute, {
        query: {
          from: sampleId("point:bsi"),
          to: sampleId("point:akureyri"),
          seats: 1,
          sort: "departure",
        },
      });
      if (!found.ok) throw new Error(found.error.code);
      return found.data.results.map((result) => result.tripId);
    };
    const request = await booked(jon.accessToken, north, { fromStop: 0, toStop: 3, seats: 3 });
    expect(await search()).not.toContain(north);
    expect((await details(north, 0, 3)).part).toMatchObject({ state: "full", freeSeats: 0 });

    // Past the request's deadline; nothing has stored its expiry yet.
    await later(hours(12) + 60, anna, jon, gunna);
    expect(await occupancy(north)).toEqual([3, 3, 3]);
    expect((await details(north, 0, 3, 1, jon.accessToken)).part).toMatchObject({
      state: "open",
      freeSeats: 3,
    });
    expect((await details(north, 0, 3, 1, jon.accessToken)).myBooking).toBeNull();
    expect(await search()).toContain(north);
    expect(
      await api.client.call(tripBookingsRoute, {
        accessToken: anna.accessToken,
        params: { id: north },
      }),
    ).toMatchObject({
      data: { bookings: [], segments: [{ occupancy: 0 }, { occupancy: 0 }, { occupancy: 0 }] },
    });
    expect(
      await api.client.call(myBookingsRoute, {
        accessToken: jon.accessToken,
        query: { when: "past" },
      }),
    ).toMatchObject({ data: { bookings: [{ id: request.id, status: "expired" }] } });

    // An unpaid instant booking frees its seats 30 minutes on, the same way.
    const unpaid = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 3, seats: 2 });
    expect((await details(airport, 0, 3)).part.freeSeats).toBe(0);
    await later(30 * 60, gunna);
    expect((await details(airport, 0, 3)).part.freeSeats).toBe(2);
    expect(
      await api.client.call(bookingRoute, {
        accessToken: gunna.accessToken,
        params: { id: unpaid.id },
      }),
    ).toMatchObject({
      data: { status: "expired", requestExpiresAt: null, paymentDueAt: unpaid.paymentDueAt },
    });
  });

  it("keeps each segment's seats equal to the bookings holding them, whatever happens", async () => {
    const anna = await driverOf(north);
    const people = [
      await newMember("Jón"),
      await newMember("Gunna"),
      await newMember("Siggi"),
      await newMember("Óli"),
    ];
    const made: { id: string; passenger: (typeof people)[number] }[] = [];
    // A fixed pseudo-random sequence (linear congruential), so a failure repeats.
    let seed = 20261113;
    const random = (below: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % below;
    };
    for (let step = 0; step < 40; step++) {
      // A new address for each step, so the trip details limit never stops the run.
      api.ip = `203.0.113.${String(step + 1)}`;
      const passenger = people[random(people.length)] ?? anna;
      const action = random(6);
      if (action < 3 || made.length === 0) {
        const board = random(3);
        const result = await book(passenger.accessToken, north, {
          fromStop: board,
          toStop: board + 1 + random(3 - board),
          seats: 1 + random(2),
        });
        if (result.ok) made.push({ id: result.data.id, passenger });
      } else if (action === 5) {
        await later(hours(1) + random(hours(3)), anna, ...people);
      } else {
        const target = made[random(made.length)];
        if (target === undefined) continue;
        const params = { id: target.id };
        const answer = random(3);
        if (answer === 0) {
          await api.client.call(acceptRequestRoute, {
            accessToken: anna.accessToken,
            params,
            body: {},
          });
        } else if (answer === 1) {
          await api.client.call(declineRequestRoute, {
            accessToken: anna.accessToken,
            params,
            body: { reason: null },
          });
        } else {
          await api.client.call(withdrawRequestRoute, {
            accessToken: target.passenger.accessToken,
            params,
            body: {},
          });
        }
      }
      expect(await occupancy(north)).toEqual(await heldByBookings(north));
      const held = await heldByBookings(north, api.now());
      expect((await details(north, 0, 3)).part.freeSeats).toBe(3 - Math.max(...held));
    }
    expect(made.length).toBeGreaterThan(3);
  });

  it("is backed by the database: no segment ever holds more seats than the car has (R5.2)", async () => {
    await expect(
      api.connection.db
        .update(schema.segments)
        .set({ occupancy: 4 })
        .where(and(eq(schema.segments.tripId, north), eq(schema.segments.position, 0))),
    ).rejects.toThrow();
  });
});

describe("answering and withdrawing requests (spec 5, 3.3 and 3.4)", () => {
  it("lets the driver accept a request, which then waits for payment", async () => {
    const anna = await driverOf(north);
    const jon = await newMember("Jón");
    const request = await booked(jon.accessToken, north, { fromStop: 1, toStop: 3 });
    const stranger = await newMember("Óli");
    expect(
      await api.client.call(acceptRequestRoute, {
        accessToken: stranger.accessToken,
        params: { id: request.id },
        body: {},
      }),
    ).toMatchObject({ status: 404 });
    expect(
      await api.client.call(acceptRequestRoute, {
        accessToken: jon.accessToken,
        params: { id: request.id },
        body: {},
      }),
    ).toMatchObject({ status: 404 });
    const accepted = await api.client.call(acceptRequestRoute, {
      accessToken: anna.accessToken,
      params: { id: request.id },
      body: {},
    });
    expect(accepted).toMatchObject({
      status: 200,
      data: {
        status: "accepted",
        viewer: "driver",
        paymentDueAt: new Date(api.now().getTime() + 30 * 60_000).toISOString(),
      },
    });
    expect(await occupancy(north)).toEqual([0, 1, 1]);
    expect(
      await api.client.call(acceptRequestRoute, {
        accessToken: anna.accessToken,
        params: { id: request.id },
        body: {},
      }),
    ).toMatchObject({ status: 409, error: { code: "booking_not_requested" } });
  });

  it("confirms an accepted free request at once (R5.11)", async () => {
    await api.connection.db
      .update(schema.segments)
      .set({ price: 0 })
      .where(eq(schema.segments.tripId, north));
    const anna = await driverOf(north);
    const jon = await newMember("Jón");
    const request = await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    const accepted = await api.client.call(acceptRequestRoute, {
      accessToken: anna.accessToken,
      params: { id: request.id },
      body: {},
    });
    expect(accepted).toMatchObject({ data: { status: "confirmed", paymentDueAt: null } });

    // Cancelled later (as spec 6 will allow), it was no withdrawal: the
    // driver had decided.
    await api.connection.db
      .update(schema.bookings)
      .set({ status: "cancelled", cancelledBy: "passenger" })
      .where(eq(schema.bookings.id, request.id));
    expect(
      await api.client.call(bookingRoute, {
        accessToken: jon.accessToken,
        params: { id: request.id },
      }),
    ).toMatchObject({ data: { status: "cancelled", withdrawn: false } });
  });

  it("lets the driver decline with a reason that only the operator sees (R5.7)", async () => {
    const anna = await driverOf(north);
    const jon = await newMember("Jón");
    const request = await booked(jon.accessToken, north, { fromStop: 0, toStop: 2, seats: 2 });
    const declined = await api.client.call(declineRequestRoute, {
      accessToken: anna.accessToken,
      params: { id: request.id },
      body: { reason: "luggage" },
    });
    expect(declined).toMatchObject({ status: 200, data: { status: "declined" } });
    expect(JSON.stringify(declined)).not.toMatch(/luggage/);
    const [row] = await api.connection.db
      .select({ reason: schema.bookings.declineReason })
      .from(schema.bookings)
      .where(eq(schema.bookings.id, request.id));
    expect(row?.reason).toBe("luggage");
    expect(await occupancy(north)).toEqual([0, 0, 0]);
  });

  it("lets the passenger withdraw a request, which frees the seats (R5.8)", async () => {
    const jon = await newMember("Jón");
    const request = await booked(jon.accessToken, north, { fromStop: 0, toStop: 3 });
    const withdraw = () =>
      api.client.call(withdrawRequestRoute, {
        accessToken: jon.accessToken,
        params: { id: request.id },
        body: {},
      });
    expect(await withdraw()).toMatchObject({
      status: 200,
      data: { status: "cancelled", withdrawn: true },
    });
    expect(await withdraw()).toMatchObject({
      status: 409,
      error: { code: "booking_not_requested" },
    });
    expect(await occupancy(north)).toEqual([0, 0, 0]);
  });

  it("lets only the passenger withdraw and only the driver decline", async () => {
    const anna = await driverOf(north);
    const jon = await newMember("Jón");
    const stranger = await newMember("Óli");
    const request = await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    const params = { id: request.id };
    for (const who of [anna, stranger]) {
      expect(
        await api.client.call(withdrawRequestRoute, {
          accessToken: who.accessToken,
          params,
          body: {},
        }),
      ).toMatchObject({ status: 404 });
    }
    for (const who of [jon, stranger]) {
      expect(
        await api.client.call(declineRequestRoute, {
          accessToken: who.accessToken,
          params,
          body: { reason: null },
        }),
      ).toMatchObject({ status: 404 });
    }
    expect(await occupancy(north)).toEqual([1, 0, 0]);
  });

  it("cannot accept a request once its deadline has passed", async () => {
    const anna = await driverOf(north);
    const jon = await newMember("Jón");
    const request = await booked(jon.accessToken, north, { fromStop: 0, toStop: 3 });
    await later(hours(12), anna);
    expect(
      await api.client.call(acceptRequestRoute, {
        accessToken: anna.accessToken,
        params: { id: request.id },
        body: {},
      }),
    ).toMatchObject({ status: 409, error: { code: "booking_not_requested" } });
    expect(await occupancy(north)).toEqual([0, 0, 0]);
  });
});

describe("reading bookings (spec 5, 3.6 and 3.7)", () => {
  it("lists my upcoming bookings soonest first, and the rest as past", async () => {
    const jon = await newMember("Jón");
    const toAirport = await booked(jon.accessToken, airport, { fromStop: 0, toStop: 3 });
    const north1 = await booked(jon.accessToken, north, { fromStop: 1, toStop: 2 });
    await api.client.call(withdrawRequestRoute, {
      accessToken: jon.accessToken,
      params: { id: north1.id },
      body: {},
    });
    const north2 = await booked(jon.accessToken, north, { fromStop: 2, toStop: 3 });
    const list = async (when: "upcoming" | "past") => {
      const result = await api.client.call(myBookingsRoute, {
        accessToken: jon.accessToken,
        query: { when },
      });
      if (!result.ok) throw new Error(result.error.code);
      return result.data.bookings.map((booking) => booking.id);
    };
    expect(await list("upcoming")).toEqual([toAirport.id, north2.id]);
    expect(await list("past")).toEqual([north1.id]);
  });

  it("shows a booking to its passenger and the trip's driver, and to nobody else", async () => {
    const anna = await driverOf(north);
    const jon = await newMember("Jón");
    const request = await booked(jon.accessToken, north, { fromStop: 1, toStop: 2 });
    const read = (accessToken: string) =>
      api.client.call(bookingRoute, { accessToken, params: { id: request.id } });
    expect(await read(jon.accessToken)).toMatchObject({ data: { viewer: "passenger" } });
    expect(await read(anna.accessToken)).toMatchObject({
      data: { viewer: "driver", passenger: { firstName: "Jón" }, confirmed: null },
    });
    const stranger = await newMember("Óli");
    expect(await read(stranger.accessToken)).toMatchObject({ status: 404 });
  });

  it("shows the number plate and where to stand only once the booking is confirmed (R5.12)", async () => {
    await api.connection.db
      .update(schema.vehicles)
      .set({ registration: "AB123" })
      .where(eq(schema.vehicles.id, sampleId("car:jon")));
    await api.connection.db
      .update(schema.segments)
      .set({ price: 0 })
      .where(eq(schema.segments.tripId, vik));
    const gunna = await newMember("Gunna");
    const paidFor = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
    const free = await booked(gunna.accessToken, vik, { fromStop: 0, toStop: 1 });
    expect(paidFor.confirmed).toBeNull();
    expect(free.confirmed).toMatchObject({
      registration: "AB123",
      whereToStand: { en: expect.any(String) as unknown },
    });
  });

  it("gives the driver the trip's requests and bookings with the seats held on each stretch", async () => {
    const anna = await driverOf(north);
    const jon = await newMember("Jón");
    const gunna = await newMember("Gunna");
    const first = await booked(jon.accessToken, north, { fromStop: 0, toStop: 2 });
    const second = await booked(gunna.accessToken, north, { fromStop: 1, toStop: 3, seats: 2 });
    await api.client.call(acceptRequestRoute, {
      accessToken: anna.accessToken,
      params: { id: second.id },
      body: {},
    });
    const result = await api.client.call(tripBookingsRoute, {
      accessToken: anna.accessToken,
      params: { id: north },
    });
    expect(result).toMatchObject({
      status: 200,
      data: {
        capacity: 3,
        segments: [
          { position: 0, occupancy: 1 },
          { position: 1, occupancy: 3 },
          { position: 2, occupancy: 2 },
        ],
      },
    });
    if (!result.ok) return;
    // Requests first, then bookings.
    expect(result.data.bookings.map((booking) => [booking.id, booking.status])).toEqual([
      [first.id, "requested"],
      [second.id, "accepted"],
    ]);
    expect(
      await api.client.call(tripBookingsRoute, {
        accessToken: jon.accessToken,
        params: { id: north },
      }),
    ).toMatchObject({ status: 404 });
  });

  it("counts the requests waiting for the driver on each trip in My trips (spec 5, 3.3)", async () => {
    const anna = await driverOf(north);
    const jon = await newMember("Jón");
    const gunna = await newMember("Gunna");
    await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    const second = await booked(gunna.accessToken, north, { fromStop: 1, toStop: 2 });
    const waiting = async () => {
      const result = await api.client.call(myTripsRoute, {
        accessToken: anna.accessToken,
        query: {},
      });
      if (!result.ok) throw new Error(result.error.code);
      return result.data.trips.map((trip) => [trip.id, trip.openRequests]);
    };
    const closing = async () => {
      const result = await api.client.call(myTripsRoute, {
        accessToken: anna.accessToken,
        query: {},
      });
      if (!result.ok) throw new Error(result.error.code);
      return result.data.trips.find((trip) => trip.id === north)?.requestsCloseAt;
    };
    expect(await waiting()).toEqual([[north, 2]]);
    // The first deadline among the open requests, for "Answer by" (spec 16, 3.3).
    const first = await api.client.call(bookingRoute, {
      accessToken: anna.accessToken,
      params: { id: second.id },
    });
    if (!first.ok) throw new Error(first.error.code);
    expect(await closing()).toBe(first.data.requestExpiresAt);
    await api.client.call(acceptRequestRoute, {
      accessToken: anna.accessToken,
      params: { id: second.id },
      body: {},
    });
    expect(await waiting()).toEqual([[north, 1]]);
    // A request whose deadline passed no longer waits, before any job runs.
    await later(hours(12), anna);
    expect(await waiting()).toEqual([[north, 0]]);
    expect(await closing()).toBeNull();
  });

  it("lists My trips as upcoming or past by the trip's last stop (spec 16, section 6)", async () => {
    const anna = await driverOf(north);
    const created = await api.client.call(createTripRoute, {
      accessToken: anna.accessToken,
      body: { stops: [sampleId("point:bsi"), sampleId("point:borgarnes")] },
    });
    if (!created.ok) throw new Error(created.error.code);
    const listed = async (when?: "upcoming" | "past") => {
      const result = await api.client.call(myTripsRoute, {
        accessToken: anna.accessToken,
        query: when === undefined ? {} : { when },
      });
      if (!result.ok) throw new Error(result.error.code);
      return result.data.trips.map((trip) => trip.id);
    };
    expect(await listed()).toEqual([created.data.id, north]);
    expect(await listed("upcoming")).toEqual([created.data.id, north]);
    expect(await listed("past")).toEqual([]);
    // Saturday at 10:00: under way since BSÍ at 09:00, so still to come.
    await later(hours(22), anna);
    expect(await listed("upcoming")).toEqual([created.data.id, north]);
    // Saturday at 16:00, after Hof, Akureyri: past. A draft is never past.
    await later(hours(6), anna);
    expect(await listed("upcoming")).toEqual([created.data.id]);
    expect(await listed("past")).toEqual([north]);
  });

  it("counts the seats taken on each stretch in My trips (spec 16, section 6)", async () => {
    const anna = await driverOf(north);
    const jon = await newMember("Jón");
    const taken = async () => {
      const result = await api.client.call(myTripsRoute, {
        accessToken: anna.accessToken,
        query: {},
      });
      if (!result.ok) throw new Error(result.error.code);
      return result.data.trips.find((trip) => trip.id === north)?.segments.map((s) => s.seatsTaken);
    };
    expect(await taken()).toEqual([0, 0, 0]);
    const request = await booked(jon.accessToken, north, { fromStop: 1, toStop: 2, seats: 2 });
    expect(await taken()).toEqual([0, 2, 0]);
    await api.client.call(withdrawRequestRoute, {
      accessToken: jon.accessToken,
      params: { id: request.id },
      body: {},
    });
    expect(await taken()).toEqual([0, 0, 0]);
    // A request whose deadline passed holds no seats, before any job runs.
    await booked(jon.accessToken, north, { fromStop: 0, toStop: 3 });
    expect(await taken()).toEqual([1, 1, 1]);
    await later(hours(12), anna);
    expect(await taken()).toEqual([0, 0, 0]);
  });
});
