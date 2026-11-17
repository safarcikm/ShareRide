import { randomUUID } from "node:crypto";
import {
  acceptRequestRoute,
  bookingRoute,
  bookTripRoute,
  cancelBookingRoute,
  cancellationPreviewRoute,
  cancelTripRoute,
  conversationMessagesRoute,
  createTripRoute,
  declineRequestRoute,
  myBookingsRoute,
  myTripRoute,
  myTripsRoute,
  startPaymentRoute,
  testPaymentRoute,
  tripBookingsRoute,
  tripSearchRoute,
  withdrawRequestRoute,
  type Booking,
  type BookTripBody,
  type CancelBookingBody,
  type CancelTripBody,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { sampleId } from "@shareride/db/seed";
import { driverCancelReasons, passengerCancelReasons } from "@shareride/domain";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import { createPaymentService } from "../payments/service.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  hours,
  sampleTrip,
  seedForBookings,
  type Member,
} from "./testing.ts";

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

const {
  newMember,
  later,
  rewind,
  driverOf,
  details,
  book,
  booked,
  paid,
  occupancy,
  heldByBookings,
} = bookingHelpers(() => api);

async function stored(id: string) {
  const [row] = await api.connection.db
    .select()
    .from(schema.bookings)
    .where(eq(schema.bookings.id, id));
  return row;
}

async function paymentsOf(bookingId: string) {
  return api.connection.db
    .select({ status: schema.payments.status })
    .from(schema.payments)
    .where(eq(schema.payments.bookingId, bookingId));
}

async function eventsOf(bookingId: string, kind: string) {
  return api.connection.db
    .select({ payload: schema.outboxEvents.payload })
    .from(schema.outboxEvents)
    .where(
      and(
        eq(schema.outboxEvents.kind, kind),
        sql`${schema.outboxEvents.payload}->>'bookingId' = ${bookingId}`,
      ),
    );
}

/** A booking from the first stop to the last, paid. */
async function paidBooking(tripId: string, passenger: Member) {
  const booking = await booked(passenger.accessToken, tripId, { fromStop: 0, toStop: 3 });
  await paid(passenger.accessToken, booking.id);
  return booking;
}

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

describe("the trip limit (rule P3, spec 17)", () => {
  /**
   * Every stretch of the north trip at 1 000 kr a seat, its cap: a 9 000 kr
   * limit for 3 seats, in place of the rounding of real distances.
   */
  async function priced() {
    await api.connection.db
      .update(schema.segments)
      .set({ capacity: 3, cap: 1000, price: 1000 })
      .where(eq(schema.segments.tripId, north));
  }

  /**
   * Jón's request for the whole route, as if made at a higher price before
   * seats were added (spec 17, gap 1): `paid` of the limit is taken.
   */
  async function bookedEarlier(paid: number) {
    await priced();
    const jon = await newMember("Jón");
    const request = await booked(jon.accessToken, north, { fromStop: 0, toStop: 3 });
    await api.connection.db
      .update(schema.bookings)
      .set({ totalPrice: paid })
      .where(eq(schema.bookings.id, request.id));
    return { jon, request };
  }

  it("refuses a booking that would take the trip past its limit, and takes one that fits", async () => {
    await bookedEarlier(7000);
    const kari = await newMember("Kári");
    expect(await book(kari.accessToken, north, { fromStop: 0, toStop: 3 })).toMatchObject({
      status: 409,
      error: { code: "trip_limit_reached" },
    });
    expect(await occupancy(north)).toEqual([1, 1, 1]);
    expect(await book(kari.accessToken, north, { fromStop: 0, toStop: 2 })).toMatchObject({
      status: 201,
    });
  });

  it("lets only one of two bookings at once take the last room", async () => {
    await bookedEarlier(7500);
    const [kari, lara] = await Promise.all([newMember("Kári"), newMember("Lára")]);
    const results = await Promise.all(
      [kari, lara].map((member) => book(member.accessToken, north, { fromStop: 1, toStop: 2 })),
    );
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(results.find((result) => !result.ok)).toMatchObject({
      error: { code: "trip_limit_reached" },
    });
  });

  it("gives back the room of a request that expires (R5.5)", async () => {
    await bookedEarlier(7000);
    const kari = await newMember("Kári");
    expect(await book(kari.accessToken, north, { fromStop: 0, toStop: 3 })).toMatchObject({
      error: { code: "trip_limit_reached" },
    });
    // Requests expire 12 hours after they are made, unanswered.
    await later(hours(12) + 1, kari);
    expect(await book(kari.accessToken, north, { fromStop: 0, toStop: 3 })).toMatchObject({
      status: 201,
    });
  });

  it("does not count a request withdrawn before it was paid", async () => {
    const { jon, request } = await bookedEarlier(7000);
    const kari = await newMember("Kári");
    expect(await book(kari.accessToken, north, { fromStop: 0, toStop: 3 })).toMatchObject({
      error: { code: "trip_limit_reached" },
    });
    const withdrawn = await api.client.call(withdrawRequestRoute, {
      accessToken: jon.accessToken,
      params: { id: request.id },
      body: {},
    });
    expect(withdrawn.ok).toBe(true);
    expect(await book(kari.accessToken, north, { fromStop: 0, toStop: 3 })).toMatchObject({
      status: 201,
    });
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
    expect(declined).toMatchObject({
      status: 200,
      data: { status: "declined", cancellation: null },
    });
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
      // A withdrawal is not a cancellation (spec 6, 3.5.4).
      data: { status: "cancelled", withdrawn: true, cancellation: null },
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

describe("cancelling a booking (spec 6, 3.5)", () => {
  const none = { amount: 0, currency: "ISK" } as const;

  const preview = (member: Member, id: string) =>
    api.client.call(cancellationPreviewRoute, { accessToken: member.accessToken, params: { id } });

  const cancel = (member: Member, id: string, body: CancelBookingBody) =>
    api.client.call(cancelBookingRoute, {
      accessToken: member.accessToken,
      params: { id },
      body,
    });

  /** What the preview says cancelling for the reason does now. */
  async function shownTerms(
    member: Member,
    id: string,
    reason: CancelBookingBody["reason"] = "plans_changed",
  ) {
    const shown = await preview(member, id);
    if (!shown.ok) throw new Error(shown.error.code);
    const option = shown.data.reasons.find((offered) => offered.reason === reason);
    if (option === undefined) throw new Error(`${reason} is not offered.`);
    return { refund: option.refund, countsOnReliability: option.countsOnReliability };
  }

  /** Seconds from now until the passenger gets in. */
  const untilBoarding = (booking: Booking) =>
    (new Date(booking.board.plannedAt).getTime() - api.now().getTime()) / 1000;

  /** Moves the trip and all its times, as the driver will with PR 5. */
  async function move(tripId: string, minutes: number) {
    const by = sql.raw(`interval '${String(minutes)} minutes'`);
    const { db } = api.connection;
    await db
      .update(schema.trips)
      .set({ departsAt: sql`${schema.trips.departsAt} + ${by}` })
      .where(eq(schema.trips.id, tripId));
    await db
      .update(schema.tripStops)
      .set({ plannedAt: sql`${schema.tripStops.plannedAt} + ${by}` })
      .where(eq(schema.tripStops.tripId, tripId));
  }

  it("shows the terms, then cancels a paid booking two days ahead with a full refund that does not count", async () => {
    const jon = await driverOf(vik, "Jón");
    const gunna = await newMember("Gunna");
    const booking = await paidBooking(vik, gunna);
    expect(await preview(gunna, booking.id)).toEqual({
      ok: true,
      status: 200,
      data: {
        reasons: passengerCancelReasons.map((reason) => ({
          reason,
          refund: booking.total,
          countsOnReliability: false,
        })),
      },
    });

    const cancelled = await cancel(gunna, booking.id, {
      reason: "plans_changed",
      terms: { refund: booking.total, countsOnReliability: false },
    });
    expect(cancelled).toMatchObject({
      status: 200,
      data: {
        status: "cancelled",
        withdrawn: false,
        cancellation: {
          by: "passenger",
          reason: "plans_changed",
          refund: booking.total,
          countsOnReliability: false,
        },
        confirmed: null,
      },
    });
    // The seats are free for others (rule S1), and the refund is owed.
    expect(await occupancy(vik)).toEqual([0, 0, 0]);
    expect((await details(vik, 0, 3)).part.freeSeats).toBe(2);
    expect(await stored(booking.id)).toMatchObject({
      status: "cancelled",
      cancelledBy: "passenger",
      cancelledAt: api.now(),
      cancelReason: "plans_changed",
      refundAmount: booking.total.amount,
      countsOnReliability: false,
    });
    expect(await paymentsOf(booking.id)).toEqual([{ status: "refund_due" }]);
    expect(await eventsOf(booking.id, "BookingCancelled")).toEqual([
      { payload: { bookingId: booking.id, by: "passenger" } },
    ]);
    // The driver sees the reason, and not whether it counts for the passenger.
    expect(
      await api.client.call(bookingRoute, {
        accessToken: jon.accessToken,
        params: { id: booking.id },
      }),
    ).toMatchObject({
      data: {
        viewer: "driver",
        cancellation: { by: "passenger", reason: "plans_changed", countsOnReliability: null },
      },
    });

    // The refund job pays it back once, and the passenger is told.
    const payments = createPaymentService({
      db: api.connection.db,
      clock: () => api.now(),
      provider: api.features.payments,
    });
    expect(await payments.refundOwed()).toBe(1);
    expect(await payments.refundOwed()).toBe(0);
    expect(await paymentsOf(booking.id)).toEqual([{ status: "refunded" }]);
    expect(await eventsOf(booking.id, "RefundIssued")).toEqual([
      { payload: { bookingId: booking.id } },
    ]);
  });

  it("counts in the last 24 hours, and refunds in full until 15 minutes before boarding (rule M2, R6.8)", async () => {
    const gunna = await newMember("Gunna");
    const booking = await paidBooking(airport, gunna);
    const full = { refund: booking.total, countsOnReliability: true };
    expect(await shownTerms(gunna, booking.id)).toEqual(full);
    // Weather never counts (R6.8).
    expect(await shownTerms(gunna, booking.id, "weather")).toEqual({
      ...full,
      countsOnReliability: false,
    });
    await later(untilBoarding(booking) - 15 * 60, gunna);
    expect(await shownTerms(gunna, booking.id)).toEqual(full);
    await later(60, gunna);
    const late = { refund: none, countsOnReliability: true };
    expect(await shownTerms(gunna, booking.id)).toEqual(late);

    expect(await cancel(gunna, booking.id, { reason: "found_another", terms: late })).toMatchObject(
      { status: 200, data: { status: "cancelled", cancellation: { ...late, by: "passenger" } } },
    );
    expect(await stored(booking.id)).toMatchObject({ refundAmount: 0, countsOnReliability: true });
    expect(await paymentsOf(booking.id)).toEqual([{ status: "succeeded" }]);
    expect(await occupancy(airport)).toEqual([0, 0, 0]);
  });

  it("refuses once the planned time at the boarding stop has come: the trip day takes over (spec 8)", async () => {
    const gunna = await newMember("Gunna");
    const booking = await paidBooking(airport, gunna);
    await later(untilBoarding(booking) - 60, gunna);
    const terms = await shownTerms(gunna, booking.id);
    await later(60, gunna);
    const refused = { status: 409, error: { code: "booking_not_cancellable" } };
    expect(await preview(gunna, booking.id)).toMatchObject(refused);
    expect(await cancel(gunna, booking.id, { reason: "plans_changed", terms })).toMatchObject(
      refused,
    );
    expect(await stored(booking.id)).toMatchObject({ status: "confirmed", cancelReason: null });
    expect(await occupancy(airport)).toEqual([1, 1, 1]);
  });

  it("cancels a free ride with nothing to refund and no payment to touch", async () => {
    await api.connection.db
      .update(schema.segments)
      .set({ price: 0 })
      .where(eq(schema.segments.tripId, vik));
    const gunna = await newMember("Gunna");
    const booking = await booked(gunna.accessToken, vik, { fromStop: 0, toStop: 3 });
    expect(booking.status).toBe("confirmed");
    const terms = await shownTerms(gunna, booking.id);
    expect(terms).toEqual({ refund: none, countsOnReliability: false });
    expect(await cancel(gunna, booking.id, { reason: "plans_changed", terms })).toMatchObject({
      status: 200,
      data: { status: "cancelled", cancellation: { refund: none } },
    });
    expect(await paymentsOf(booking.id)).toEqual([]);
    expect(await occupancy(vik)).toEqual([0, 0, 0]);
  });

  it("refuses an unpaid booking whose payment deadline passed since the preview (rule M1)", async () => {
    const gunna = await newMember("Gunna");
    const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 2 });
    const terms = await shownTerms(gunna, booking.id);
    await later(31 * 60, gunna);
    expect(await cancel(gunna, booking.id, { reason: "plans_changed", terms })).toMatchObject({
      status: 409,
      error: { code: "booking_not_cancellable" },
    });
    expect(await stored(booking.id)).toMatchObject({ status: "expired", cancelReason: null });
  });

  it("answers someone else's cancellation as not cancellable, not as the passenger's own", async () => {
    const gunna = await newMember("Gunna");
    const booking = await paidBooking(vik, gunna);
    const terms = await shownTerms(gunna, booking.id);
    // As the driver will with PR 4.
    await api.connection.db
      .update(schema.bookings)
      .set({
        status: "cancelled",
        cancelledAt: api.now(),
        cancelledBy: "driver",
        cancelReason: "car_problem",
      })
      .where(eq(schema.bookings.id, booking.id));
    expect(await cancel(gunna, booking.id, { reason: "plans_changed", terms })).toMatchObject({
      status: 409,
      error: { code: "booking_not_cancellable" },
    });
  });

  it("answers terms_changed with the terms now when a time limit passed since the preview", async () => {
    const gunna = await newMember("Gunna");
    const booking = await paidBooking(airport, gunna);
    await later(untilBoarding(booking) - 16 * 60, gunna);
    const terms = await shownTerms(gunna, booking.id);
    await later(2 * 60, gunna);
    expect(await cancel(gunna, booking.id, { reason: "plans_changed", terms })).toMatchObject({
      status: 409,
      error: { code: "terms_changed", terms: { refund: none, countsOnReliability: true } },
    });
    expect(await stored(booking.id)).toMatchObject({ status: "confirmed", refundAmount: null });
    expect(await occupancy(airport)).toEqual([1, 1, 1]);
  });

  it("cancels an unpaid booking with nothing to refund, and refunds a payment that settles after", async () => {
    const gunna = await newMember("Gunna");
    const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 2 });
    const payment = await api.client.call(startPaymentRoute, {
      accessToken: gunna.accessToken,
      params: { id: booking.id },
      body: {},
    });
    if (!payment.ok) throw new Error(payment.error.code);
    const nothing = { refund: none, countsOnReliability: false };
    expect(await shownTerms(gunna, booking.id)).toEqual(nothing);
    expect(
      await cancel(gunna, booking.id, { reason: "plans_changed", terms: nothing }),
    ).toMatchObject({ status: 200, data: { status: "cancelled", cancellation: nothing } });
    expect(await occupancy(airport)).toEqual([0, 0, 0]);

    // The payment went through just after: it is refunded at once.
    expect(
      await api.client.call(testPaymentRoute, {
        accessToken: gunna.accessToken,
        params: { id: payment.data.paymentId },
        body: { outcome: "succeeded" },
      }),
    ).toMatchObject({ ok: true });
    expect(await paymentsOf(booking.id)).toEqual([{ status: "refunded" }]);
    // The booking says so too (R6.7).
    expect(await stored(booking.id)).toMatchObject({
      status: "cancelled",
      refundAmount: booking.total.amount,
    });
    expect(
      await api.client.call(bookingRoute, {
        accessToken: gunna.accessToken,
        params: { id: booking.id },
      }),
    ).toMatchObject({ data: { cancellation: { refund: booking.total } } });
    expect(await eventsOf(booking.id, "RefundIssued")).toHaveLength(1);
  });

  it("answers the cancelled booking again when asked twice, even at once, and refunds once", async () => {
    const gunna = await newMember("Gunna");
    const booking = await paidBooking(vik, gunna);
    const body = {
      reason: "weather",
      terms: { refund: booking.total, countsOnReliability: false },
    } as const;
    const [first, second] = await Promise.all([
      cancel(gunna, booking.id, body),
      cancel(gunna, booking.id, body),
    ]);
    if (!first.ok || !second.ok) throw new Error("not cancelled");
    expect(first.data).toMatchObject({ status: "cancelled", cancellation: { reason: "weather" } });
    expect(second.data).toEqual(first.data);
    // Asked again later with other terms, as a retry may be: still the same.
    expect(
      await cancel(gunna, booking.id, {
        reason: "other",
        terms: { refund: none, countsOnReliability: true },
      }),
    ).toEqual(first);
    expect(await paymentsOf(booking.id)).toEqual([{ status: "refund_due" }]);
    expect(await eventsOf(booking.id, "BookingCancelled")).toHaveLength(1);
    expect(await occupancy(vik)).toEqual([0, 0, 0]);
    expect(await preview(gunna, booking.id)).toMatchObject({
      status: 409,
      error: { code: "booking_not_cancellable" },
    });
  });

  it("counts a move from the departure when booked: over 30 minutes, a full refund until boarding that never counts (R6.3)", async () => {
    const gunna = await newMember("Gunna");
    const booking = await paidBooking(airport, gunna);
    const [trip] = await api.connection.db
      .select({ departsAt: schema.trips.departsAt })
      .from(schema.trips)
      .where(eq(schema.trips.id, airport));
    expect((await stored(booking.id))?.departsAtWhenBooked).toEqual(trip?.departsAt);

    await move(airport, 45);
    await later(untilBoarding(booking) + 40 * 60, gunna);
    // 5 minutes before the new boarding time.
    expect(await shownTerms(gunna, booking.id)).toEqual({
      refund: booking.total,
      countsOnReliability: false,
    });
    // A booking from before this was recorded takes its trip's departure as it is now.
    await api.connection.db
      .update(schema.bookings)
      .set({ departsAtWhenBooked: null })
      .where(eq(schema.bookings.id, booking.id));
    expect(await shownTerms(gunna, booking.id)).toEqual({
      refund: none,
      countsOnReliability: true,
    });
  });

  it("refuses a request, a reason or note the other gives, and anyone else", async () => {
    const anna = await driverOf(north);
    const jon = await newMember("Jón");
    const stranger = await newMember("Óli");
    const request = await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    const nothing = { refund: none, countsOnReliability: false };
    // A request is withdrawn instead (spec 5).
    expect(await preview(jon, request.id)).toMatchObject({
      status: 409,
      error: { code: "booking_not_cancellable" },
    });
    expect(
      await cancel(jon, request.id, { reason: "plans_changed", terms: nothing }),
    ).toMatchObject({ status: 409, error: { code: "booking_not_cancellable" } });

    const accepted = await api.client.call(acceptRequestRoute, {
      accessToken: anna.accessToken,
      params: { id: request.id },
      body: {},
    });
    expect(accepted).toMatchObject({ data: { status: "accepted" } });
    expect(await cancel(jon, request.id, { reason: "car_problem", terms: nothing })).toMatchObject({
      status: 400,
      error: { code: "validation_failed", details: [{ path: "reason", issue: "not_offered" }] },
    });
    // A passenger gives no note; that is the driver's (spec 6, 3.4).
    expect(
      await cancel(jon, request.id, { reason: "plans_changed", note: "Sorry", terms: nothing }),
    ).toMatchObject({
      status: 400,
      error: { code: "validation_failed", details: [{ path: "note", issue: "not_offered" }] },
    });
    // Nor does the driver give a passenger's reason.
    expect(
      await cancel(anna, request.id, { reason: "found_another", terms: nothing }),
    ).toMatchObject({
      status: 400,
      error: { code: "validation_failed", details: [{ path: "reason", issue: "not_offered" }] },
    });
    // The driver's note keeps contact in the app, like a trip's note (R3.10).
    expect(
      await cancel(anna, request.id, {
        reason: "illness",
        note: "Sorry! Call me on 555 1234",
        terms: nothing,
      }),
    ).toMatchObject({
      status: 400,
      error: {
        code: "validation_failed",
        details: [{ path: "note", issue: "contact_details" }],
      },
    });
    expect(
      await cancel(anna, request.id, { reason: "illness", note: "a".repeat(501), terms: nothing }),
    ).toMatchObject({
      status: 400,
      error: { code: "validation_failed", details: [{ path: "note", issue: "too_long" }] },
    });
    expect(await preview(stranger, request.id)).toMatchObject({ status: 404 });
    expect(
      await cancel(stranger, request.id, { reason: "plans_changed", terms: nothing }),
    ).toMatchObject({ status: 404 });
    expect(await stored(request.id)).toMatchObject({ status: "accepted" });
    expect(await occupancy(north)).toEqual([1, 0, 0]);
  });

  it("lets the driver cancel one booking with a note: a full refund that counts on the driver (spec 6, 3.4)", async () => {
    const jon = await driverOf(vik, "Jón");
    const gunna = await newMember("Gunna");
    const booking = await paidBooking(vik, gunna);
    expect(await preview(jon, booking.id)).toEqual({
      ok: true,
      status: 200,
      data: {
        reasons: driverCancelReasons.map((reason) => ({
          reason,
          refund: booking.total,
          countsOnReliability: reason !== "weather" && reason !== "road_closed",
        })),
      },
    });
    const terms = { refund: booking.total, countsOnReliability: true };
    const note = "Því miður bilaði bíllinn. Strætó 51 fer kl. 10:00.";
    // Stored trimmed and composed, as the database counts its characters.
    const typed = `  ${note.normalize("NFD")}\n`;
    const cancelled = await cancel(jon, booking.id, { reason: "car_problem", note: typed, terms });
    expect(cancelled).toMatchObject({
      status: 200,
      data: {
        status: "cancelled",
        viewer: "driver",
        cancellation: { by: "driver", reason: "car_problem", note, ...terms },
      },
    });
    expect(await stored(booking.id)).toMatchObject({
      cancelledBy: "driver",
      cancelReason: "car_problem",
      cancelNote: note,
      refundAmount: booking.total.amount,
      countsOnReliability: true,
    });
    expect(await paymentsOf(booking.id)).toEqual([{ status: "refund_due" }]);
    expect(await occupancy(vik)).toEqual([0, 0, 0]);
    expect(await eventsOf(booking.id, "BookingCancelled")).toEqual([
      { payload: { bookingId: booking.id, by: "driver" } },
    ]);
    // The passenger sees why, with the note, but not whether it counts on the driver.
    expect(
      await api.client.call(bookingRoute, {
        accessToken: gunna.accessToken,
        params: { id: booking.id },
      }),
    ).toMatchObject({
      data: {
        cancellation: { by: "driver", reason: "car_problem", note, countsOnReliability: null },
      },
    });
    // The passenger can no longer cancel it.
    expect(await preview(gunna, booking.id)).toMatchObject({ status: 409 });
  });

  it("answers the driver's cancellation again when asked twice, even at once, and refunds once", async () => {
    const jon = await driverOf(vik, "Jón");
    const gunna = await newMember("Gunna");
    const booking = await paidBooking(vik, gunna);
    const body = {
      reason: "illness",
      note: "Sorry.",
      terms: { refund: booking.total, countsOnReliability: true },
    } as const;
    const [first, second] = await Promise.all([
      cancel(jon, booking.id, body),
      cancel(jon, booking.id, body),
    ]);
    if (!first.ok || !second.ok) throw new Error("not cancelled");
    expect(first.data).toMatchObject({
      status: "cancelled",
      cancellation: { by: "driver", reason: "illness", note: "Sorry." },
    });
    expect(second.data).toEqual(first.data);
    expect(await cancel(jon, booking.id, { ...body, reason: "other" })).toEqual(first);
    expect(await paymentsOf(booking.id)).toEqual([{ status: "refund_due" }]);
    expect(await eventsOf(booking.id, "BookingCancelled")).toHaveLength(1);
    // The passenger's own try is not a retry of the driver's.
    expect(
      await cancel(gunna, booking.id, {
        reason: "plans_changed",
        terms: { refund: booking.total, countsOnReliability: false },
      }),
    ).toMatchObject({ status: 409, error: { code: "booking_not_cancellable" } });
  });

  it("lets the driver cancel an unpaid booking with nothing to refund, until the time to get in", async () => {
    const anna = await driverOf(airport);
    const gunna = await newMember("Gunna");
    const unpaid = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 2 });
    const nothing = { refund: none, countsOnReliability: false };
    expect(await cancel(anna, unpaid.id, { reason: "car_smaller", terms: nothing })).toMatchObject({
      status: 200,
      data: { cancellation: { by: "driver", note: "", ...nothing } },
    });
    const paidOne = await paidBooking(airport, await newMember("Dóra"));
    await later(untilBoarding(paidOne), anna);
    expect(
      await cancel(anna, paidOne.id, {
        reason: "car_problem",
        terms: { refund: paidOne.total, countsOnReliability: true },
      }),
    ).toMatchObject({ status: 409, error: { code: "booking_not_cancellable" } });
  });

  it("tells both in the conversation, each in their own words (spec 7, 3.1)", async () => {
    const jon = await driverOf(vik, "Jón");
    const gunna = await newMember("Gunna");
    const booking = await paidBooking(vik, gunna);
    await cancel(gunna, booking.id, {
      reason: "found_another",
      terms: { refund: booking.total, countsOnReliability: false },
    });
    const lastLine = async (member: Member) => {
      const page = await api.client.call(conversationMessagesRoute, {
        accessToken: member.accessToken,
        params: { id: booking.id },
        query: {},
      });
      if (!page.ok) throw new Error(page.error.code);
      return page.data.messages[0];
    };
    expect(await lastLine(gunna)).toMatchObject({
      from: "system",
      kind: "system",
      system: { key: "cancelled", by: "me", reason: "found_another" },
    });
    expect(await lastLine(jon)).toMatchObject({
      from: "system",
      system: { key: "cancelled", by: "them", reason: "found_another", note: "" },
    });

    // The driver's note goes with their line, as written.
    const dora = await newMember("Dóra");
    const other = await paidBooking(vik, dora);
    const note = "So sorry, Dóra.";
    await cancel(jon, other.id, {
      reason: "illness",
      note,
      terms: { refund: other.total, countsOnReliability: true },
    });
    const page = await api.client.call(conversationMessagesRoute, {
      accessToken: dora.accessToken,
      params: { id: other.id },
      query: {},
    });
    if (!page.ok) throw new Error(page.error.code);
    expect(page.data.messages[0]).toMatchObject({
      system: { key: "cancelled", by: "them", reason: "illness", note, wholeTrip: false },
    });
  });
});

describe("cancelling a trip (spec 6, 3.3)", () => {
  const cancelTrip = (member: Member, id: string, body: CancelTripBody) =>
    api.client.call(cancelTripRoute, { accessToken: member.accessToken, params: { id }, body });
  const cancelBooking = (member: Member, id: string, body: CancelBookingBody) =>
    api.client.call(cancelBookingRoute, { accessToken: member.accessToken, params: { id }, body });
  const read = (member: Member, id: string) =>
    api.client.call(bookingRoute, { accessToken: member.accessToken, params: { id } });

  /** As the driver answers a request on the north trip. */
  async function accepted(anna: Member, bookingId: string) {
    const answer = await api.client.call(acceptRequestRoute, {
      accessToken: anna.accessToken,
      params: { id: bookingId },
      body: {},
    });
    if (!answer.ok) throw new Error(answer.error.code);
  }

  it("cancels every booking with a full refund of what was paid, declines requests, and tells everyone once", async () => {
    const anna = await driverOf(north);
    const gunna = await newMember("Gunna");
    const dora = await newMember("Dóra");
    const oli = await newMember("Óli");
    const siggi = await newMember("Siggi");
    const confirmed = await booked(gunna.accessToken, north, { fromStop: 0, toStop: 3 });
    await accepted(anna, confirmed.id);
    await paid(gunna.accessToken, confirmed.id);
    const second = await booked(siggi.accessToken, north, { fromStop: 0, toStop: 1 });
    await accepted(anna, second.id);
    await paid(siggi.accessToken, second.id);
    const unpaid = await booked(dora.accessToken, north, { fromStop: 1, toStop: 2 });
    await accepted(anna, unpaid.id);
    const request = await booked(oli.accessToken, north, { fromStop: 2, toStop: 3 });
    expect(await occupancy(north)).toEqual([2, 2, 2]);

    const note = "Því miður bilaði bíllinn.";
    const body = {
      reason: "car_problem",
      note: `  ${note.normalize("NFD")} `,
      countsOnReliability: true,
    } as const;
    // Asked twice at once, as a double tap or a retry may: one cancellation.
    const [result, again] = await Promise.all([
      cancelTrip(anna, north, body),
      cancelTrip(anna, north, body),
    ]);
    expect(again).toEqual(result);
    expect(result).toMatchObject({
      status: 200,
      data: {
        id: north,
        status: "cancelled",
        cancellation: { reason: "car_problem", note, countsOnReliability: true },
      },
    });
    expect(await stored(confirmed.id)).toMatchObject({
      status: "cancelled",
      cancelledBy: "driver",
      cancelReason: "car_problem",
      cancelNote: note,
      refundAmount: confirmed.total.amount,
      // The trip counts once, not each of its bookings (spec 8, 3.8).
      countsOnReliability: false,
    });
    expect(await stored(unpaid.id)).toMatchObject({
      status: "cancelled",
      cancelledBy: "driver",
      refundAmount: 0,
    });
    expect(await stored(request.id)).toMatchObject({ status: "declined" });
    // Each who paid is refunded once, what they paid.
    expect(await stored(second.id)).toMatchObject({ refundAmount: second.total.amount });
    expect(await paymentsOf(confirmed.id)).toEqual([{ status: "refund_due" }]);
    expect(await paymentsOf(second.id)).toEqual([{ status: "refund_due" }]);
    expect(await occupancy(north)).toEqual([0, 0, 0]);
    for (const booking of [confirmed, second, unpaid, request]) {
      expect(await eventsOf(booking.id, "TripCancelled")).toEqual([
        { payload: { tripId: north, bookingId: booking.id } },
      ]);
    }

    // The passenger reads why, with the note; the driver's trip says it is cancelled.
    const seen = await api.client.call(bookingRoute, {
      accessToken: gunna.accessToken,
      params: { id: confirmed.id },
    });
    expect(seen).toMatchObject({
      data: {
        status: "cancelled",
        cancellation: { by: "driver", reason: "car_problem", note, wholeTrip: true },
      },
    });
    // So does the chat (spec 6, 3.3), but a request has none.
    const chat = await api.client.call(conversationMessagesRoute, {
      accessToken: gunna.accessToken,
      params: { id: confirmed.id },
      query: {},
    });
    if (!chat.ok) throw new Error(chat.error.code);
    expect(chat.data.messages.map((message) => message.system)).toContainEqual({
      key: "cancelled",
      by: "them",
      reason: "car_problem",
      note,
      wholeTrip: true,
    });
    // Óli's request is declined, and says why.
    expect(
      await api.client.call(bookingRoute, {
        accessToken: oli.accessToken,
        params: { id: request.id },
      }),
    ).toMatchObject({
      data: {
        status: "declined",
        cancellation: {
          by: "driver",
          reason: "car_problem",
          note,
          wholeTrip: true,
          refund: { amount: 0 },
          countsOnReliability: null,
        },
      },
    });
    expect(
      await api.client.call(myTripRoute, { accessToken: anna.accessToken, params: { id: north } }),
    ).toMatchObject({ data: { status: "cancelled" } });
    // It is past, in My trips (3.1), and no longer upcoming.
    const listed = async (when: "upcoming" | "past") => {
      const answer = await api.client.call(myTripsRoute, {
        accessToken: anna.accessToken,
        query: { when },
      });
      if (!answer.ok) throw new Error(answer.error.code);
      return answer.data.trips.map((trip) => [trip.id, trip.status]);
    };
    expect(await listed("upcoming")).not.toContainEqual([north, "cancelled"]);
    expect(await listed("past")).toContainEqual([north, "cancelled"]);
    // The driver sees it count once, on the trip, from any of its bookings.
    expect(await read(anna, confirmed.id)).toMatchObject({
      data: { cancellation: { wholeTrip: true, countsOnReliability: true } },
    });

    // Asked again later, as a retry is: the same trip, refunded and told once.
    expect(await cancelTrip(anna, north, { reason: "other", countsOnReliability: false })).toEqual(
      result,
    );
    expect(await paymentsOf(confirmed.id)).toHaveLength(1);
    expect(await eventsOf(confirmed.id, "TripCancelled")).toHaveLength(1);
    // No longer bookable.
    expect(await book(dora.accessToken, north, { fromStop: 0, toStop: 1 })).toMatchObject({
      ok: false,
    });
  });

  it("counts nothing for the weather or a road closure, or with nobody who paid", async () => {
    const jon = await driverOf(vik, "Jón");
    await paidBooking(vik, await newMember("Gunna"));
    expect(
      await cancelTrip(jon, vik, { reason: "weather", countsOnReliability: false }),
    ).toMatchObject({
      data: { cancellation: { reason: "weather", note: "", countsOnReliability: false } },
    });
    const anna = await driverOf(airport);
    await booked((await newMember("Dóra")).accessToken, airport, { fromStop: 0, toStop: 3 });
    expect(
      await cancelTrip(anna, airport, { reason: "plans_changed", countsOnReliability: false }),
    ).toMatchObject({ data: { cancellation: { countsOnReliability: false } } });
  });

  it("cancels nothing when the driver was shown another answer, as someone paid meanwhile", async () => {
    const anna = await driverOf(north);
    const gunna = await newMember("Gunna");
    const booking = await booked(gunna.accessToken, north, { fromStop: 0, toStop: 3 });
    await accepted(anna, booking.id);
    // The screen showed an unpaid booking, which does not count; then Gunna paid.
    await paid(gunna.accessToken, booking.id);
    expect(
      await cancelTrip(anna, north, { reason: "illness", countsOnReliability: false }),
    ).toMatchObject({
      status: 409,
      error: { code: "terms_changed", countsOnReliability: true },
    });
    expect(await stored(booking.id)).toMatchObject({ status: "confirmed" });
    expect(await eventsOf(booking.id, "TripCancelled")).toEqual([]);
    expect(
      await cancelTrip(anna, north, { reason: "illness", countsOnReliability: true }),
    ).toMatchObject({ status: 200, data: { status: "cancelled" } });
  });

  it("leaves a booking cancelled alone before as it was, with its own reason", async () => {
    const jon = await driverOf(vik, "Jón");
    const gunna = await newMember("Gunna");
    const alone = await paidBooking(vik, gunna);
    const terms = { refund: alone.total, countsOnReliability: true };
    expect(await cancelBooking(jon, alone.id, { reason: "car_smaller", terms })).toMatchObject({
      status: 200,
    });
    const dora = await newMember("Dóra");
    const withTrip = await paidBooking(vik, dora);
    await cancelTrip(jon, vik, { reason: "weather", countsOnReliability: false });
    expect(await read(gunna, alone.id)).toMatchObject({
      data: { cancellation: { reason: "car_smaller", wholeTrip: false } },
    });
    expect(await read(jon, alone.id)).toMatchObject({
      data: { cancellation: { wholeTrip: false, countsOnReliability: true } },
    });
    expect(await read(dora, withTrip.id)).toMatchObject({
      data: { cancellation: { reason: "weather", wholeTrip: true } },
    });
    expect(await paymentsOf(alone.id)).toEqual([{ status: "refund_due" }]);
    expect(await eventsOf(alone.id, "TripCancelled")).toEqual([]);
  });

  it("says nothing of a request the driver declined before the trip was cancelled", async () => {
    const anna = await driverOf(north);
    const oli = await newMember("Óli");
    const request = await booked(oli.accessToken, north, { fromStop: 0, toStop: 1 });
    await api.client.call(declineRequestRoute, {
      accessToken: anna.accessToken,
      params: { id: request.id },
      body: { reason: "other" },
    });
    await cancelTrip(anna, north, { reason: "illness", countsOnReliability: false });
    expect(await read(oli, request.id)).toMatchObject({
      data: { status: "declined", cancellation: null },
    });
  });

  it("refuses once the trip has left, a note with contact details, a draft, and anyone else's trip", async () => {
    const anna = await driverOf(north);
    const illness = { reason: "illness", countsOnReliability: false } as const;
    expect(
      await cancelTrip(anna, north, { ...illness, note: "Call me on 555 1234" }),
    ).toMatchObject({
      status: 400,
      error: { code: "validation_failed", details: [{ path: "note", issue: "contact_details" }] },
    });
    expect(await cancelTrip(await newMember("Óli"), north, illness)).toMatchObject({
      status: 404,
    });
    // A draft is deleted, never cancelled.
    const jon = await driverOf(vik, "Jón");
    await api.connection.db
      .update(schema.trips)
      .set({ status: "draft" })
      .where(eq(schema.trips.id, vik));
    expect(await cancelTrip(jon, vik, illness)).toMatchObject({ status: 404 });
    const [trip] = await api.connection.db
      .select({ departsAt: schema.trips.departsAt })
      .from(schema.trips)
      .where(eq(schema.trips.id, north));
    await later((trip?.departsAt?.getTime() ?? 0) / 1000 - api.now().getTime() / 1000, anna);
    expect(await cancelTrip(anna, north, illness)).toMatchObject({
      status: 409,
      error: { code: "trip_not_cancellable" },
    });
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
    const first = await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    // Gunna asks an hour later, so her request closes an hour after Jón's.
    await later(hours(1), anna, gunna);
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
    const deadline = async (id: string) => {
      const result = await api.client.call(bookingRoute, {
        accessToken: anna.accessToken,
        params: { id },
      });
      if (!result.ok) throw new Error(result.error.code);
      return result.data.requestExpiresAt;
    };
    expect(await waiting()).toEqual([[north, 2]]);
    // The first deadline among the open requests, for "Answer by" (spec 16, 3.3).
    expect(await deadline(first.id)).not.toBe(await deadline(second.id));
    expect(await closing()).toBe(await deadline(first.id));
    await api.client.call(acceptRequestRoute, {
      accessToken: anna.accessToken,
      params: { id: first.id },
      body: {},
    });
    expect(await waiting()).toEqual([[north, 1]]);
    expect(await closing()).toBe(await deadline(second.id));
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
