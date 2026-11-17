import {
  acceptRequestRoute,
  addVehicleRoute,
  bookingRoute,
  cancelBookingRoute,
  cancellationPreviewRoute,
  cancelTripRoute,
  changeTripRoute,
  conversationMessagesRoute,
  myTripRoute,
  soonestTripsRoute,
  tripSearchRoute,
  type TripChangeBody,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { sampleId } from "@shareride/db/seed";
import { defaultTripSettings, highestPriceLevel } from "@shareride/domain";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";

// The sample trips at the test clock (Friday 13 November 2026, noon): Anna
// drives BSÍ to Hof, Akureyri on Saturday at 09:00 through N1 Borgarnes and
// Olís Blönduós (3 seats, approval), and Jón drives Selfoss to Vík on
// Sunday (instant). Spec 6, 3.2: the driver moves the departure.

let api: TestApi;

const { north, vik } = sampleTrip;
const minuteMs = 60_000;

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  await freshSampleTrips(api);
  await api.connection.db.execute(sql`delete from outbox_events`);
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

const iso = (moment: Date) => moment.toISOString();
const moved = (moment: Date, minutes: number) => new Date(moment.getTime() + minutes * minuteMs);

function change(member: Member, id: string, body: TripChangeBody, preview = false) {
  return api.client.call(changeTripRoute, {
    accessToken: member.accessToken,
    params: { id },
    query: { preview },
    body,
  });
}

const departure = (departsAt: Date): TripChangeBody => ({
  kind: "departure",
  departsAt: iso(departsAt),
});

/** The trip's stops' planned times as the driver sees them. */
async function timesOf(member: Member, id: string) {
  const trip = await api.client.call(myTripRoute, {
    accessToken: member.accessToken,
    params: { id },
  });
  if (!trip.ok) throw new Error(trip.error.code);
  return trip.data.stops.map((stop) => new Date(stop.plannedAt ?? 0));
}

async function accepted(driver: Member, bookingId: string) {
  const answer = await api.client.call(acceptRequestRoute, {
    accessToken: driver.accessToken,
    params: { id: bookingId },
    body: {},
  });
  if (!answer.ok) throw new Error(answer.error.code);
}

/** A booking from `fromStop` to `toStop` on the north trip, accepted and paid. */
async function paidBooking(anna: Member, passenger: Member, fromStop = 0, toStop = 3) {
  const booking = await booked(passenger.accessToken, north, { fromStop, toStop });
  await accepted(anna, booking.id);
  await paid(passenger.accessToken, booking.id);
  return booking;
}

async function read(member: Member, id: string) {
  const booking = await api.client.call(bookingRoute, {
    accessToken: member.accessToken,
    params: { id },
  });
  if (!booking.ok) throw new Error(booking.error.code);
  return booking.data;
}

/** What cancelling now for `reason` does for the passenger (spec 6, 3.5). */
async function cancelling(member: Member, id: string, reason: string) {
  const preview = await api.client.call(cancellationPreviewRoute, {
    accessToken: member.accessToken,
    params: { id },
  });
  if (!preview.ok) throw new Error(preview.error.code);
  return preview.data.reasons.find((terms) => terms.reason === reason);
}

async function changesOf(tripId: string) {
  return api.connection.db
    .select({
      id: schema.tripChanges.id,
      kind: schema.tripChanges.kind,
      before: schema.tripChanges.before,
      after: schema.tripChanges.after,
    })
    .from(schema.tripChanges)
    .where(eq(schema.tripChanges.tripId, tripId))
    .orderBy(asc(schema.tripChanges.changedAt), asc(schema.tripChanges.id));
}

async function eventsOf(kind: string) {
  return api.connection.db
    .select({ payload: schema.outboxEvents.payload })
    .from(schema.outboxEvents)
    .where(eq(schema.outboxEvents.kind, kind))
    .orderBy(asc(schema.outboxEvents.createdAt), asc(schema.outboxEvents.id));
}

async function stored(id: string) {
  const [row] = await api.connection.db
    .select()
    .from(schema.bookings)
    .where(eq(schema.bookings.id, id));
  return row;
}

/** Moves the clock on to `time` (Iceland keeps UTC all year). */
async function until(time: string, ...members: Member[]) {
  const seconds = (new Date(time).getTime() - api.now().getTime()) / 1000;
  if (seconds < 0) throw new Error(`The clock is already past ${time}.`);
  await later(seconds, ...members);
}

describe("moving a trip's departure (spec 6, 3.2)", () => {
  it("previews a move without saving it, then saves the same: every stop moves, and each booked passenger is told", async () => {
    const anna = await driverOf(north);
    const gunna = await newMember("Gunna");
    const dora = await newMember("Dóra");
    const oli = await newMember("Óli");
    const confirmed = await paidBooking(anna, gunna);
    const unpaid = await booked(dora.accessToken, north, { fromStop: 1, toStop: 2 });
    await accepted(anna, unpaid.id);
    const request = await booked(oli.accessToken, north, { fromStop: 2, toStop: 3 });
    const times = await timesOf(anna, north);
    const [leaves] = times;
    if (leaves === undefined) throw new Error("No stops");
    const shifted = times.map((time) => iso(moved(time, 45)));
    const effect = {
      departsAt: shifted[0],
      arrivesAt: shifted.at(-1),
      plannedTimes: shifted,
      // Requests are told only if the trip is cancelled (spec 7, 3.3).
      told: 2,
      // Only Gunna has paid; Dóra can cancel as before, with nothing to refund.
      freeCancellations: 1,
      // Óli's request stays open; he sees the new time on the trip.
      requests: 1,
      expiring: 0,
    };

    const preview = await change(anna, north, departure(moved(leaves, 45)), true);
    expect(preview).toMatchObject({ status: 200, data: effect });
    expect(await timesOf(anna, north)).toEqual(times);
    expect(await changesOf(north)).toEqual([]);
    expect(await eventsOf("DepartureMoved")).toEqual([]);

    // The preview matches what saving does (spec 6, section 9).
    const saved = await change(anna, north, departure(moved(leaves, 45)));
    expect(saved).toMatchObject({ status: 200, data: effect });
    expect(saved.ok && saved.data).toEqual(preview.ok && preview.data);
    expect((await timesOf(anna, north)).map(iso)).toEqual(shifted);
    const [recorded] = await changesOf(north);
    expect(await changesOf(north)).toEqual([
      {
        id: expect.any(String) as unknown,
        kind: "departure",
        before: { departsAt: iso(leaves) },
        after: { departsAt: shifted[0] },
      },
    ]);
    expect(await eventsOf("DepartureMoved")).toEqual([
      { payload: { bookingId: confirmed.id, tripChangeId: recorded?.id } },
      { payload: { bookingId: unpaid.id, tripChangeId: recorded?.id } },
    ]);
    // Search shows the new times at once.
    expect((await details(north)).stops.map((stop) => stop.plannedAt)).toEqual(shifted);
    expect((await read(oli, request.id)).board.plannedAt).toBe(shifted[2]);
  });

  it("lets a paid passenger cancel with a full refund after a move of more than 30 minutes, without it counting (R6.3)", async () => {
    const anna = await driverOf(north);
    const gunna = await newMember("Gunna");
    const dora = await newMember("Dóra");
    const confirmed = await paidBooking(anna, gunna);
    const second = await paidBooking(anna, dora, 1, 2);
    const times = await timesOf(anna, north);
    const [leaves, borgarnes] = times;
    if (leaves === undefined || borgarnes === undefined) throw new Error("No stops");
    // Less than 24 hours before boarding, plans changing counts (R6.8).
    expect(await cancelling(gunna, confirmed.id, "plans_changed")).toEqual({
      reason: "plans_changed",
      refund: confirmed.total,
      countsOnReliability: true,
    });
    expect(await read(gunna, confirmed.id)).toMatchObject({ changes: [], movedFar: false });

    await later(60, anna, gunna, dora);
    const result = await change(anna, north, departure(moved(leaves, 45)));
    expect(result).toMatchObject({ status: 200, data: { told: 2, freeCancellations: 2 } });

    // Each passenger reads the move from their own boarding time.
    expect(await read(gunna, confirmed.id)).toMatchObject({
      changes: [
        {
          kind: "departure",
          from: iso(leaves),
          to: iso(moved(leaves, 45)),
          changedAt: iso(api.now()),
        },
      ],
      movedFar: true,
    });
    expect(await read(dora, second.id)).toMatchObject({
      changes: [{ kind: "departure", from: iso(borgarnes), to: iso(moved(borgarnes, 45)) }],
      movedFar: true,
    });
    // The driver sees the same on the booking.
    expect((await read(anna, confirmed.id)).changes).toHaveLength(1);
    for (const reason of ["plans_changed", "trip_changed"]) {
      expect(await cancelling(gunna, confirmed.id, reason)).toEqual({
        reason,
        refund: confirmed.total,
        countsOnReliability: false,
      });
    }
    // The chat says so, in each reader's words.
    const chat = await api.client.call(conversationMessagesRoute, {
      accessToken: gunna.accessToken,
      params: { id: confirmed.id },
      query: {},
    });
    if (!chat.ok) throw new Error(chat.error.code);
    expect(chat.data.messages[0]?.system).toEqual({
      key: "departure_changed",
      from: iso(leaves),
      to: iso(moved(leaves, 45)),
    });
  });

  it("counts each move from the time booked: 20 minutes and 20 more is over 30, and moved back it is not (R6.3)", async () => {
    const anna = await driverOf(north);
    const gunna = await newMember("Gunna");
    const confirmed = await paidBooking(anna, gunna);
    const [leaves] = await timesOf(anna, north);
    if (leaves === undefined) throw new Error("No stops");
    await later(60, anna, gunna);

    expect(await change(anna, north, departure(moved(leaves, 20)))).toMatchObject({
      data: { told: 1, freeCancellations: 0 },
    });
    expect((await read(gunna, confirmed.id)).movedFar).toBe(false);
    expect(await change(anna, north, departure(moved(leaves, 40)))).toMatchObject({
      data: { told: 1, freeCancellations: 1 },
    });
    expect((await read(gunna, confirmed.id)).movedFar).toBe(true);
    expect(await change(anna, north, departure(moved(leaves, 10)))).toMatchObject({
      data: { told: 1, freeCancellations: 0 },
    });
    const booking = await read(gunna, confirmed.id);
    expect(booking.movedFar).toBe(false);
    expect(booking.changes.map((one) => one.kind === "departure" && [one.from, one.to])).toEqual([
      [iso(leaves), iso(moved(leaves, 20))],
      [iso(moved(leaves, 20)), iso(moved(leaves, 40))],
      [iso(moved(leaves, 40)), iso(moved(leaves, 10))],
    ]);
    // Moved back, the passenger cancels on the usual terms (R6.8).
    expect(await cancelling(gunna, confirmed.id, "plans_changed")).toMatchObject({
      countsOnReliability: true,
    });
  });

  it("refuses a move more than 2 hours from when anyone booked, naming the departures allowed (R6.4)", async () => {
    const anna = await driverOf(north);
    const gunna = await newMember("Gunna");
    await paidBooking(anna, gunna);
    // A request limits the move too, as its passenger booked for that time.
    await booked((await newMember("Óli")).accessToken, north, { fromStop: 2, toStop: 3 });
    const times = await timesOf(anna, north);
    const [leaves] = times;
    if (leaves === undefined) throw new Error("No stops");

    expect(await change(anna, north, departure(moved(leaves, 125)))).toMatchObject({
      status: 422,
      error: {
        code: "change_not_allowed",
        details: [{ path: "departsAt", issue: "move_too_far" }],
        departureWindow: { earliest: iso(moved(leaves, -120)), latest: iso(moved(leaves, 120)) },
      },
    });
    expect(await change(anna, north, departure(moved(leaves, -125)), true)).toMatchObject({
      status: 422,
    });
    expect(await timesOf(anna, north)).toEqual(times);
    expect(await changesOf(north)).toEqual([]);
    expect(await change(anna, north, departure(moved(leaves, 120)))).toMatchObject({
      status: 200,
    });

    // Nobody booked on Jón's trip: any time within the 60 days (spec 6, 3.2).
    const jon = await driverOf(vik, "Jón");
    const [toVik] = await timesOf(jon, vik);
    if (toVik === undefined) throw new Error("No stops");
    expect(await change(jon, vik, departure(moved(toVik, 24 * 60 + 15)))).toMatchObject({
      status: 200,
      data: { told: 0, freeCancellations: 0 },
    });
    expect(await eventsOf("DepartureMoved")).toHaveLength(1);
  });

  it("refuses a departure too soon, too far ahead, or overlapping another of the driver's trips (R3.5, R3.7)", async () => {
    const anna = await driverOf(north);
    const refused = (issue: string) => ({
      status: 422,
      error: { code: "change_not_allowed", details: [{ path: "departsAt", issue }] },
    });
    expect(await change(anna, north, departure(moved(api.now(), 20)))).toMatchObject(
      refused("departure_too_soon"),
    );
    expect(await change(anna, north, departure(moved(api.now(), 61 * 24 * 60)))).toMatchObject(
      refused("departure_too_far"),
    );
    // Anna drives to Vík on Sunday as well: the north trip cannot move onto it.
    await api.connection.db
      .update(schema.trips)
      .set({ driverId: anna.userId })
      .where(eq(schema.trips.id, vik));
    const [toVik] = await timesOf(anna, vik);
    if (toVik === undefined) throw new Error("No stops");
    expect(await change(anna, north, departure(moved(toVik, -60)))).toMatchObject(
      refused("overlaps_trip"),
    );
  });

  it("keeps a move and a booking made at the same moment consistent (R5.2)", async () => {
    const anna = await driverOf(north);
    const gunna = await newMember("Gunna");
    const [leaves] = await timesOf(anna, north);
    if (leaves === undefined) throw new Error("No stops");
    const target = moved(leaves, 150);

    const [moving, booking] = await Promise.all([
      change(anna, north, departure(target)),
      book(gunna.accessToken, north, { fromStop: 0, toStop: 1 }),
    ]);
    if (!booking.ok) throw new Error(booking.error.code);
    const row = await stored(booking.data.id);
    const [now] = await timesOf(anna, north);
    if (moving.ok) {
      // Moved first: the request was made for the new time.
      expect(row?.departsAtWhenBooked).toEqual(target);
      expect(now).toEqual(target);
    } else {
      // Booked first: 2.5 hours is too far from the time Gunna booked.
      expect(moving).toMatchObject({ status: 422 });
      expect(row?.departsAtWhenBooked).toEqual(leaves);
      expect(now).toEqual(leaves);
    }
    expect(await occupancy(north)).toEqual([1, 0, 0]);
  });

  it("works out request deadlines again from the new boarding time, and expires one that has passed", async () => {
    const anna = await driverOf(north);
    const gunna = await newMember("Gunna");
    // Saturday 03:00: a request for 09:00 must be answered 2 hours before boarding (R5.5).
    await until("2026-11-14T03:00:00Z", anna, gunna);
    const request = await booked(gunna.accessToken, north, { fromStop: 0, toStop: 1 });
    expect((await stored(request.id))?.expiresAt).toEqual(new Date("2026-11-14T07:00:00Z"));

    await change(anna, north, departure(new Date("2026-11-14T08:00:00Z")));
    expect((await stored(request.id))?.expiresAt).toEqual(new Date("2026-11-14T06:00:00Z"));

    // At 05:30, a move to 07:00 brings the deadline to 05:00: it has passed,
    // and the check says so before saving.
    await until("2026-11-14T05:30:00Z", anna, gunna);
    const sooner = departure(new Date("2026-11-14T07:00:00Z"));
    const effect = { told: 0, requests: 0, expiring: 1 };
    expect(await change(anna, north, sooner, true)).toMatchObject({ status: 200, data: effect });
    expect(await stored(request.id)).toMatchObject({ status: "requested" });
    expect(await change(anna, north, sooner)).toMatchObject({ status: 200, data: effect });
    expect(await stored(request.id)).toMatchObject({ status: "expired" });
    expect(await occupancy(north)).toEqual([0, 0, 0]);
    expect(await eventsOf("BookingExpired")).toEqual([
      { payload: { bookingId: request.id, reason: "unanswered" } },
    ]);
  });

  it("tells a free ride's passenger, without counting a refund (R5.11)", async () => {
    await api.connection.db
      .update(schema.segments)
      .set({ price: 0 })
      .where(eq(schema.segments.tripId, vik));
    const jon = await driverOf(vik);
    const gunna = await newMember("Gunna");
    const free = await booked(gunna.accessToken, vik, { fromStop: 0, toStop: 3 });
    expect(free.status).toBe("confirmed");
    const [leaves] = await timesOf(jon, vik);
    if (leaves === undefined) throw new Error("No stops");
    await later(60, jon, gunna);
    expect(await change(jon, vik, departure(moved(leaves, 45)))).toMatchObject({
      status: 200,
      data: { told: 1, freeCancellations: 0 },
    });
    // She may still cancel without it counting (R6.3), and reads why.
    expect(await read(gunna, free.id)).toMatchObject({ movedFar: true, changes: [{}] });
  });

  it("shows a booking that ended only the moves made while it held seats", async () => {
    const anna = await driverOf(north);
    const gunna = await newMember("Gunna");
    const confirmed = await paidBooking(anna, gunna);
    const [leaves] = await timesOf(anna, north);
    if (leaves === undefined) throw new Error("No stops");
    await later(60, anna, gunna);
    await change(anna, north, departure(moved(leaves, 20)));
    await later(60, anna, gunna);
    const terms = await cancelling(gunna, confirmed.id, "plans_changed");
    if (terms === undefined) throw new Error("No terms");
    const cancelled = await api.client.call(cancelBookingRoute, {
      accessToken: gunna.accessToken,
      params: { id: confirmed.id },
      body: {
        reason: "plans_changed",
        terms: { refund: terms.refund, countsOnReliability: terms.countsOnReliability },
      },
    });
    expect(cancelled.ok).toBe(true);
    await later(60, anna, gunna);
    await change(anna, north, departure(moved(leaves, 40)));
    expect((await read(gunna, confirmed.id)).changes).toEqual([
      expect.objectContaining({ from: iso(leaves), to: iso(moved(leaves, 20)) }),
    ]);
  });

  it("refuses anyone else's trip, a draft, a cancelled trip, and one that has left (R6.1)", async () => {
    const anna = await driverOf(north);
    const [leaves] = await timesOf(anna, north);
    if (leaves === undefined) throw new Error("No stops");
    const body = departure(moved(leaves, 15));
    expect(await change(await newMember("Óli"), north, body)).toMatchObject({ status: 404 });
    // A draft changes with PATCH.
    const jon = await driverOf(vik, "Jón");
    await api.connection.db
      .update(schema.trips)
      .set({ status: "draft" })
      .where(eq(schema.trips.id, vik));
    expect(await change(jon, vik, body)).toMatchObject({ status: 404 });
    expect(
      await api.client.call(changeTripRoute, {
        accessToken: anna.accessToken,
        params: { id: north },
        query: {},
        body: { kind: "stops" } as unknown as TripChangeBody,
      }),
    ).toMatchObject({ status: 400, error: { code: "validation_failed" } });

    await until(iso(leaves), anna);
    expect(await change(anna, north, departure(moved(leaves, 60)))).toMatchObject({
      status: 409,
      error: { code: "trip_not_changeable" },
    });
  });

  it("refuses to change a cancelled trip", async () => {
    const anna = await driverOf(north);
    const [leaves] = await timesOf(anna, north);
    if (leaves === undefined) throw new Error("No stops");
    const cancelled = await api.client.call(cancelTripRoute, {
      accessToken: anna.accessToken,
      params: { id: north },
      body: { reason: "illness", countsOnReliability: false },
    });
    expect(cancelled.ok).toBe(true);
    expect(await change(anna, north, departure(moved(leaves, 15)))).toMatchObject({
      status: 409,
      error: { code: "trip_not_changeable" },
    });
    expect(await changesOf(north)).toEqual([]);
  });
});

describe("changing the seats, price level, booking mode and details (spec 6, 3.2)", () => {
  /** The trip as its driver reads it. */
  async function mine(member: Member, id: string) {
    const trip = await api.client.call(myTripRoute, {
      accessToken: member.accessToken,
      params: { id },
    });
    if (!trip.ok) throw new Error(trip.error.code);
    return trip.data;
  }

  async function segmentsOf(id: string) {
    return api.connection.db
      .select({
        capacity: schema.segments.capacity,
        cap: schema.segments.cap,
        price: schema.segments.price,
      })
      .from(schema.segments)
      .where(eq(schema.segments.tripId, id))
      .orderBy(asc(schema.segments.position));
  }

  const isk = (amount: number) => ({ amount, currency: "ISK" });

  it("refuses fewer seats than passengers hold on any stretch, and takes more (rule S5)", async () => {
    const anna = await driverOf(north);
    // Requests for two seats to Hof and one from Borgarnes to Blönduós.
    await booked((await newMember("Gunna")).accessToken, north, {
      fromStop: 0,
      toStop: 3,
      seats: 2,
    });
    await booked((await newMember("Óli")).accessToken, north, { fromStop: 1, toStop: 2 });
    const before = await mine(anna, north);

    expect(await change(anna, north, { kind: "seats", seats: 2 }, true)).toMatchObject({
      status: 422,
      error: {
        code: "change_not_allowed",
        details: [{ path: "seats", issue: "seats_below_taken" }],
      },
    });
    for (const seats of [0, 9]) {
      expect(await change(anna, north, { kind: "seats", seats })).toMatchObject({
        status: 400,
        error: { code: "validation_failed" },
      });
    }
    expect(await mine(anna, north)).toEqual(before);
    expect(await changesOf(north)).toEqual([]);

    const effect = await change(anna, north, { kind: "seats", seats: 4 });
    expect(effect).toMatchObject({
      status: 200,
      data: {
        seats: 4,
        priceLevel: 100,
        priceLevelLowered: false,
        told: 0,
        requests: 2,
      },
    });
    const after = await mine(anna, north);
    expect(after.seats).toBe(4);
    // The car shares its cost with one more seat: each stretch may cost less (rule P3).
    const stored = await segmentsOf(north);
    expect(stored.map((segment) => segment.capacity)).toEqual([4, 4, 4]);
    for (const [index, segment] of stored.entries()) {
      expect(segment.cap).toBeLessThan(before.segments[index]?.cap.amount ?? 0);
    }
    expect(effect.ok && effect.data.prices).toEqual(after.segments.map((segment) => segment.price));
    expect((await details(north, 1, 2)).part.freeSeats).toBe(1);
    expect(await changesOf(north)).toEqual([
      {
        id: expect.any(String) as unknown,
        kind: "seats",
        before: { seats: 3, priceLevel: 100 },
        after: { seats: 4, priceLevel: 100 },
      },
    ]);
    // Nobody is told of seats (spec 7, 3.3).
    expect(await eventsOf("TripChanged")).toEqual([]);
  });

  it("lowers the price level when more seats need it; bookings keep the price they booked at (rules P1, P4)", async () => {
    const anna = await driverOf(north);
    const gunna = await newMember("Gunna");

    // The highest level 3 seats allow, first only previewed.
    const preview = await change(anna, north, { kind: "priceLevel", priceLevel: 250 }, true);
    expect(preview).toMatchObject({
      status: 200,
      data: { seats: 3, priceLevel: 250, priceLevelLowered: false },
    });
    expect((await mine(anna, north)).priceLevel).toBe(100);
    const saved = await change(anna, north, { kind: "priceLevel", priceLevel: 250 });
    expect(saved.ok && saved.data).toEqual(preview.ok && preview.data);
    const raised = await mine(anna, north);
    expect(raised.priceLevel).toBe(250);
    expect(raised.segments.map((segment) => segment.price)).toEqual(
      preview.ok ? preview.data.prices : [],
    );

    const booking = await paidBooking(anna, gunna);
    const shown = await details(north, 0, 3);
    expect(booking.total).toEqual(shown.part.total);

    // A fourth seat allows 200 at most, and what Gunna paid at 250 leaves
    // room for 180 (spec 17).
    const more = await change(anna, north, { kind: "seats", seats: 4 });
    expect(more).toMatchObject({
      status: 200,
      data: { seats: 4, priceLevel: 180, priceLevelLowered: true, levelLimitedBy: "trip_limit" },
    });
    const lowered = await mine(anna, north);
    expect(lowered.priceLevel).toBe(180);
    const prices = lowered.segments.map((segment) => segment.price.amount);
    expect((await segmentsOf(north)).map((segment) => segment.price)).toEqual(prices);
    expect((await details(north, 0, 3)).part.pricePerSeat).toEqual(
      isk(prices.reduce((sum, price) => sum + price, 0)),
    );
    expect((await details(north, 0, 3)).part.pricePerSeat.amount).toBeLessThan(
      shown.part.pricePerSeat.amount,
    );
    // Gunna keeps what she paid, and her booking shows no change.
    const kept = await read(gunna, booking.id);
    expect(kept.total).toEqual(booking.total);
    expect(kept.changes).toEqual([]);
    expect(
      (await changesOf(north)).map(({ kind, before, after }) => ({ kind, before, after })),
    ).toEqual([
      { kind: "priceLevel", before: { priceLevel: 100 }, after: { priceLevel: 250 } },
      {
        kind: "seats",
        before: { seats: 3, priceLevel: 250 },
        after: { seats: 4, priceLevel: 180, reason: "trip_limit" },
      },
    ]);
  });

  it("refuses a price level the seats do not allow (rule P4)", async () => {
    const anna = await driverOf(north);
    for (const priceLevel of [260, 105]) {
      expect(await change(anna, north, { kind: "priceLevel", priceLevel })).toMatchObject({
        status: 422,
        error: {
          code: "change_not_allowed",
          details: [{ path: "priceLevel", issue: "price_level_invalid" }],
        },
      });
    }
    expect((await mine(anna, north)).priceLevel).toBe(100);
  });

  it("keeps requests open when the booking mode changes", async () => {
    const anna = await driverOf(north);
    const request = await booked((await newMember("Óli")).accessToken, north, {
      fromStop: 2,
      toStop: 3,
    });

    expect(
      await change(anna, north, { kind: "bookingMode", bookingMode: "instant" }),
    ).toMatchObject({
      status: 200,
      data: { told: 0, requests: 1 },
    });
    expect((await details(north)).bookingMode).toBe("instant");
    expect((await stored(request.id))?.status).toBe("requested");
    expect((await mine(anna, north)).openRequests).toBe(1);
    // A new booking is accepted at once.
    const instant = await booked((await newMember("Dóra")).accessToken, north, {
      fromStop: 0,
      toStop: 1,
    });
    expect(instant.status).toBe("accepted");
    expect(await changesOf(north)).toMatchObject([
      {
        kind: "bookingMode",
        before: { bookingMode: "approval" },
        after: { bookingMode: "instant" },
      },
    ]);
  });

  it("changes the preferences and note, without contact details, and tells nobody (R3.10)", async () => {
    const anna = await driverOf(north);
    const gunna = await newMember("Gunna");
    const booking = await paidBooking(anna, gunna);
    const trip = await mine(anna, north);
    const preferences = { ...trip.preferences, pets: "yes" as const, chat: "quiet" as const };
    const chat = async () => {
      const messages = await api.client.call(conversationMessagesRoute, {
        accessToken: gunna.accessToken,
        params: { id: booking.id },
        query: {},
      });
      if (!messages.ok) throw new Error(messages.error.code);
      return messages.data.messages;
    };
    const lines = await chat();

    expect(
      await change(anna, north, { kind: "details", preferences, note: "Call me on 555 1234" }),
    ).toMatchObject({
      status: 422,
      error: {
        code: "change_not_allowed",
        details: [{ path: "note", issue: "note_has_contact_details" }],
      },
    });
    expect(await mine(anna, north)).toEqual(trip);

    // Kept as the database counts characters (NFC), whatever the keyboard sent.
    const note = "Pick-up by the café.";
    expect(
      await change(anna, north, { kind: "details", preferences, note: note.normalize("NFD") }),
    ).toMatchObject({ status: 200, data: { told: 0 } });
    expect(await details(north)).toMatchObject({ preferences, note });
    // Back to the old preferences, keeping the note.
    expect(
      await change(anna, north, { kind: "details", preferences: trip.preferences, note }),
    ).toMatchObject({ status: 200 });
    // The note's text is not kept, only whether it changed.
    expect(
      (await changesOf(north)).map(({ kind, before, after }) => ({ kind, before, after })),
    ).toEqual([
      {
        kind: "details",
        before: trip.preferences,
        after: { ...preferences, noteChanged: true },
      },
      {
        kind: "details",
        before: preferences,
        after: { ...trip.preferences, noteChanged: false },
      },
    ]);
    // Shown on the trip, with no notification and no line in the chat.
    expect(await eventsOf("TripChanged")).toEqual([]);
    expect(await chat()).toEqual(lines);
  });

  it("saves nothing when the value is the one the trip has", async () => {
    const anna = await driverOf(north);
    const trip = await mine(anna, north);
    const same: TripChangeBody[] = [
      { kind: "seats", seats: trip.seats },
      { kind: "priceLevel", priceLevel: trip.priceLevel },
      { kind: "bookingMode", bookingMode: trip.bookingMode },
      { kind: "details", preferences: trip.preferences, note: trip.note },
    ];
    for (const body of same) {
      expect(await change(anna, north, body)).toMatchObject({ status: 200, data: { told: 0 } });
    }
    expect(await changesOf(north)).toEqual([]);
    expect((await mine(anna, north)).updatedAt).toBe(trip.updatedAt);
  });
});

describe("the trip limit (rule P3, spec 17)", () => {
  async function mine(member: Member) {
    const trip = await api.client.call(myTripRoute, {
      accessToken: member.accessToken,
      params: { id: north },
    });
    if (!trip.ok) throw new Error(trip.error.code);
    return trip.data;
  }

  /** What a full car pays at the caps the stretches store. */
  async function limitOf() {
    const rows = await api.connection.db
      .select({ capacity: schema.segments.capacity, cap: schema.segments.cap })
      .from(schema.segments)
      .where(eq(schema.segments.tripId, north));
    return rows.reduce((sum, row) => sum + row.capacity * row.cap, 0);
  }

  /** The level's changes as recorded, without their ids. */
  async function recorded() {
    return (await changesOf(north)).map(({ kind, before, after }) => ({ kind, before, after }));
  }

  async function cancelled(member: Member, id: string) {
    const terms = await cancelling(member, id, "plans_changed");
    if (terms === undefined) throw new Error("No terms");
    const answer = await api.client.call(cancelBookingRoute, {
      accessToken: member.accessToken,
      params: { id },
      body: {
        reason: "plans_changed",
        terms: { refund: terms.refund, countsOnReliability: terms.countsOnReliability },
      },
    });
    if (!answer.ok) throw new Error(answer.error.code);
    return terms.refund.amount;
  }

  it("lowers the level when seats are added after people paid, and the seats left then fit (gap 1)", async () => {
    const anna = await driverOf(north);
    // One seat at the highest level one seat allows, paid for the whole route.
    expect((await change(anna, north, { kind: "seats", seats: 1 })).ok).toBe(true);
    const dearest = highestPriceLevel(1, defaultTripSettings);
    expect((await change(anna, north, { kind: "priceLevel", priceLevel: dearest })).ok).toBe(true);
    const gunna = await newMember("Gunna");
    const first = await paidBooking(anna, gunna);

    const preview = await change(anna, north, { kind: "seats", seats: 3 }, true);
    expect(preview).toMatchObject({
      status: 200,
      data: { seats: 3, priceLevelLowered: true, levelLimitedBy: "trip_limit" },
    });
    const level = preview.ok ? preview.data.priceLevel : -1;
    // Below what 3 seats alone allow: what Gunna paid counts.
    expect(level).toBeLessThan(highestPriceLevel(3, defaultTripSettings));
    expect((await change(anna, north, { kind: "seats", seats: 3 })).ok).toBe(true);
    const trip = await mine(anna);
    expect(trip.priceLevel).toBe(level);
    expect(trip.takings).toEqual(first.total);

    // No higher level is allowed while seats are free.
    expect(await change(anna, north, { kind: "priceLevel", priceLevel: level + 10 })).toMatchObject(
      {
        status: 422,
        error: { details: [{ path: "priceLevel", issue: "price_level_invalid" }] },
      },
    );
    // The seats left, at the new prices, fit: the booking check agrees.
    const others = [await newMember("Kári"), await newMember("Lára")];
    const more = [];
    for (const member of others) {
      more.push(await booked(member.accessToken, north, { fromStop: 0, toStop: 3 }));
    }
    const totals = [first, ...more].reduce((sum, booking) => sum + booking.total.amount, 0);
    expect(totals).toBeLessThanOrEqual(await limitOf());
    expect((await recorded()).at(-1)).toEqual({
      kind: "seats",
      before: { seats: 1, priceLevel: dearest },
      after: { seats: 3, priceLevel: level, reason: "trip_limit" },
    });
  });

  it("lowers the level after a late cancellation frees a seat whose money is kept, not after a refund", async () => {
    const anna = await driverOf(north);
    expect((await change(anna, north, { kind: "priceLevel", priceLevel: 250 })).ok).toBe(true);
    const [gunna, kari, lara] = [
      await newMember("Gunna"),
      await newMember("Kári"),
      await newMember("Lára"),
    ];
    const bookings = [];
    for (const member of [gunna, kari, lara]) bookings.push(await paidBooking(anna, member));
    const [gunnas, , laras] = bookings;
    if (gunnas === undefined || laras === undefined) throw new Error("Not booked");

    // A day ahead, Lára gets all of it back: nothing is kept, the level stays.
    expect(await cancelled(lara, laras.id)).toBe(laras.total.amount);
    expect((await mine(anna)).priceLevel).toBe(250);

    // Ten minutes before boarding, Gunna gets nothing back (rule M2).
    await until("2026-11-14T08:50:00.000Z", anna, gunna);
    expect(await cancelled(gunna, gunnas.id)).toBe(0);
    const trip = await mine(anna);
    expect(trip.priceLevel).toBeLessThan(250);
    expect(trip.takings.amount).toBe(2 * gunnas.total.amount);
    // A full car at the new prices stays within the limit.
    const free = trip.segments.reduce(
      (sum, segment) => sum + (trip.seats - segment.seatsTaken) * segment.price.amount,
      0,
    );
    expect(trip.takings.amount + free).toBeLessThanOrEqual(await limitOf());
    expect((await recorded()).at(-1)).toEqual({
      kind: "priceLevel",
      before: { priceLevel: 250 },
      after: { priceLevel: trip.priceLevel, reason: "trip_limit" },
    });
  });
});

describe("changing the car (spec 6, 3.2)", () => {
  async function newCar(member: Member) {
    const car = await api.client.call(addVehicleRoute, {
      accessToken: member.accessToken,
      body: { make: "Volvo", model: "XC40", colour: "red", registration: "AB 123" },
    });
    if (!car.ok) throw new Error(car.error.code);
    return car.data.id;
  }

  async function vehicleOf(id: string) {
    const [trip] = await api.connection.db
      .select({ vehicleId: schema.trips.vehicleId })
      .from(schema.trips)
      .where(eq(schema.trips.id, id));
    return trip?.vehicleId;
  }

  it("tells each booked passenger of a new car, on the booking and in the chat; a request is not told", async () => {
    const anna = await driverOf(north);
    const gunna = await newMember("Gunna");
    const dora = await newMember("Dóra");
    const confirmed = await paidBooking(anna, gunna);
    const unpaid = await booked(dora.accessToken, north, { fromStop: 1, toStop: 2 });
    await accepted(anna, unpaid.id);
    await booked((await newMember("Óli")).accessToken, north, { fromStop: 2, toStop: 3 });
    const before = await vehicleOf(north);
    const volvo = await newCar(anna);

    const preview = await change(anna, north, { kind: "vehicle", vehicleId: volvo }, true);
    expect(preview).toMatchObject({ status: 200, data: { told: 2, requests: 1 } });
    expect(await vehicleOf(north)).toBe(before);
    expect(await eventsOf("TripChanged")).toEqual([]);

    const saved = await change(anna, north, { kind: "vehicle", vehicleId: volvo });
    expect(saved.ok && saved.data).toEqual(preview.ok && preview.data);
    expect(await vehicleOf(north)).toBe(volvo);
    const [recorded] = await changesOf(north);
    expect(await changesOf(north)).toEqual([
      {
        id: expect.any(String) as unknown,
        kind: "vehicle",
        before: { vehicleId: before, make: "Toyota", model: "Yaris", colour: "white" },
        after: { vehicleId: volvo, make: "Volvo", model: "XC40", colour: "red" },
      },
    ]);
    // One event for each booked passenger, pointing at the change (spec 7, 3.3).
    expect((await eventsOf("TripChanged")).map(({ payload }) => payload)).toEqual(
      expect.arrayContaining([
        { bookingId: confirmed.id, tripChangeId: recorded?.id },
        { bookingId: unpaid.id, tripChangeId: recorded?.id },
      ]),
    );
    expect(await eventsOf("TripChanged")).toHaveLength(2);

    // On the booking, with the car as it is now; and in the chat.
    const read_ = await read(gunna, confirmed.id);
    expect(read_.changes).toEqual([
      {
        kind: "vehicle",
        car: { make: "Volvo", model: "XC40", colour: "red" },
        changedAt: expect.any(String) as unknown,
      },
    ]);
    expect(read_.movedFar).toBe(false);
    const chat = await api.client.call(conversationMessagesRoute, {
      accessToken: gunna.accessToken,
      params: { id: confirmed.id },
      query: {},
    });
    if (!chat.ok) throw new Error(chat.error.code);
    expect(chat.data.messages.map((message) => message.system)).toContainEqual({
      key: "car_changed",
      car: { make: "Volvo", model: "XC40", colour: "red" },
    });
  });

  it("refuses a car that is not the driver's, or was removed", async () => {
    const anna = await driverOf(north);
    const jon = await driverOf(vik, "Jón");
    const refused = {
      status: 422,
      error: { code: "change_not_allowed", details: [{ path: "vehicleId", issue: "car_missing" }] },
    };
    expect(
      await change(anna, north, { kind: "vehicle", vehicleId: await newCar(jon) }, true),
    ).toMatchObject(refused);
    const removed = await newCar(anna);
    await api.connection.db
      .update(schema.vehicles)
      .set({ removedAt: api.now() })
      .where(eq(schema.vehicles.id, removed));
    expect(await change(anna, north, { kind: "vehicle", vehicleId: removed })).toMatchObject(
      refused,
    );
    expect(await changesOf(north)).toEqual([]);
  });

  it("tells nobody when the car is the one the trip has", async () => {
    const anna = await driverOf(north);
    await paidBooking(anna, await newMember("Gunna"));
    const car = await vehicleOf(north);
    if (car === undefined || car === null) throw new Error("No car");
    expect(await change(anna, north, { kind: "vehicle", vehicleId: car })).toMatchObject({
      status: 200,
      data: { told: 0 },
    });
    expect(await changesOf(north)).toEqual([]);
    expect(await eventsOf("TripChanged")).toEqual([]);
  });
});

const point = (key: string) => sampleId(`point:${key}`);
const addStop = (key: string): TripChangeBody => ({
  kind: "addStop",
  meetingPointId: point(key),
});
const removeStop = (key: string): TripChangeBody => ({
  kind: "removeStop",
  meetingPointId: point(key),
});

/** The trip's stops in order, those removed left out. */
async function stopsOf(id: string) {
  return api.connection.db
    .select({
      id: schema.tripStops.id,
      meetingPointId: schema.tripStops.meetingPointId,
      position: schema.tripStops.position,
      plannedAt: schema.tripStops.plannedAt,
    })
    .from(schema.tripStops)
    .where(and(eq(schema.tripStops.tripId, id), isNull(schema.tripStops.removedAt)))
    .orderBy(asc(schema.tripStops.position));
}

async function segmentsOf(id: string) {
  return api.connection.db
    .select()
    .from(schema.segments)
    .where(eq(schema.segments.tripId, id))
    .orderBy(asc(schema.segments.position));
}

async function pricesOf(bookingId: string) {
  const rows = await api.connection.db
    .select({
      position: schema.bookingSegmentPrices.segmentPosition,
      price: schema.bookingSegmentPrices.price,
    })
    .from(schema.bookingSegmentPrices)
    .where(eq(schema.bookingSegmentPrices.bookingId, bookingId))
    .orderBy(asc(schema.bookingSegmentPrices.segmentPosition));
  return rows;
}

async function chatOf(member: Member, bookingId: string) {
  const chat = await api.client.call(conversationMessagesRoute, {
    accessToken: member.accessToken,
    params: { id: bookingId },
    query: {},
  });
  if (!chat.ok) throw new Error(chat.error.code);
  return chat.data.messages.map((message) => message.system);
}

describe("adding a stop (spec 6, 3.2; milestone 6 plan, decision 2)", () => {
  it("adds a stop between its neighbours, who keep their times; bookings keep their stops and totals, and each booked passenger is told", async () => {
    const anna = await driverOf(north);
    const gunna = await newMember("Gunna");
    const dora = await newMember("Dóra");
    const whole = await paidBooking(anna, gunna);
    const borgarnes = await booked(dora.accessToken, north, { fromStop: 1, toStop: 2 });
    await accepted(anna, borgarnes.id);
    await booked((await newMember("Óli")).accessToken, north, { fromStop: 2, toStop: 3 });
    const timesBefore = await timesOf(anna, north);
    const pricesBefore = await pricesOf(whole.id);
    const segmentsBefore = await segmentsOf(north);

    const preview = await change(anna, north, addStop("mosfellsbaer"), true);
    if (!preview.ok) throw new Error(preview.error.code);
    expect(await stopsOf(north)).toHaveLength(4);
    expect(preview.data).toMatchObject({ told: 2, requests: 1, freeCancellations: 0 });
    expect(preview.data.stops).toEqual(
      ["bsi", "mosfellsbaer", "borgarnes", "blonduos", "akureyri"].map(point),
    );
    // 22 of the 62 minutes to Borgarnes, on 5 minutes; the rest keep theirs.
    const [bsi, ...rest] = timesBefore;
    expect(preview.data.plannedTimes).toEqual(
      [bsi, moved(timesBefore[0] ?? new Date(), 20), ...rest].map((time) =>
        iso(time ?? new Date()),
      ),
    );
    // The new stretches priced for new bookings; the others as they were.
    expect(preview.data.prices).toHaveLength(4);
    expect(preview.data.prices.slice(2).map(({ amount }) => amount)).toEqual(
      segmentsBefore.slice(1).map((segment) => segment.price),
    );

    const saved = await change(anna, north, addStop("mosfellsbaer"));
    expect(saved.ok && saved.data).toEqual(preview.data);
    expect((await stopsOf(north)).map((stop) => stop.meetingPointId)).toEqual(preview.data.stops);
    expect((await timesOf(anna, north)).map(iso)).toEqual(preview.data.plannedTimes);
    const segments = await segmentsOf(north);
    expect(segments.map((segment) => segment.position)).toEqual([0, 1, 2, 3]);
    expect(segments.map((segment) => segment.price)).toEqual(
      preview.data.prices.map(({ amount }) => amount),
    );
    // Gunna rides both halves of the split stretch; Dóra and Óli's request
    // stay where they were (rule S1).
    expect(await occupancy(north)).toEqual([1, 1, 2, 2]);
    expect(await heldByBookings(north)).toEqual([1, 1, 2, 2]);
    expect(segments.map((segment) => segment.capacity)).toEqual([3, 3, 3, 3]);
    expect(segments[0]?.toStopId).toBe(segments[1]?.fromStopId);
    expect(segments[1]?.toStopId).toBe(segments[2]?.fromStopId);

    // Gunna keeps her total, her price for the old stretch shared by distance (rule P1).
    const prices = await pricesOf(whole.id);
    expect(prices.map((row) => row.position)).toEqual([0, 1, 2, 3]);
    expect(prices.slice(2).map((row) => row.price)).toEqual(
      pricesBefore.slice(1).map((row) => row.price),
    );
    expect((prices[0]?.price ?? 0) + (prices[1]?.price ?? 0)).toBe(pricesBefore[0]?.price);
    // BSÍ to Mosfellsbær is 16 km of the 71 to Borgarnes, so the smaller share.
    expect(prices[0]?.price).toBeLessThan((prices[1]?.price ?? 0) / 2);
    expect((await pricesOf(borgarnes.id)).map((row) => row.position)).toEqual([2]);
    const gunnaReads = await read(gunna, whole.id);
    expect(gunnaReads).toMatchObject({
      total: whole.total,
      board: { position: 0, meetingPoint: { id: point("bsi") } },
      alight: { position: 4, meetingPoint: { id: point("akureyri") } },
    });
    expect(gunnaReads.changes).toEqual([
      {
        kind: "addStop",
        stop: { is: "N1 Mosfellsbæ", en: "N1 Mosfellsbær" },
        plannedAt: preview.data.plannedTimes[1],
        changedAt: expect.any(String) as unknown,
      },
    ]);
    expect((await read(dora, borgarnes.id)).board.position).toBe(2);

    // Recorded, and told on the booking, in the chat and by an event each (spec 7, 3.3).
    const [recorded] = await changesOf(north);
    expect(await changesOf(north)).toEqual([
      {
        id: expect.any(String) as unknown,
        kind: "addStop",
        before: {},
        after: {
          meetingPointId: point("mosfellsbaer"),
          nameIs: "N1 Mosfellsbæ",
          nameEn: "N1 Mosfellsbær",
          plannedAt: preview.data.plannedTimes[1],
        },
      },
    ]);
    expect((await eventsOf("TripChanged")).map(({ payload }) => payload)).toEqual(
      expect.arrayContaining([
        { bookingId: whole.id, tripChangeId: recorded?.id },
        { bookingId: borgarnes.id, tripChangeId: recorded?.id },
      ]),
    );
    expect(await eventsOf("TripChanged")).toHaveLength(2);
    const chat = await api.client.call(conversationMessagesRoute, {
      accessToken: gunna.accessToken,
      params: { id: whole.id },
      query: {},
    });
    if (!chat.ok) throw new Error(chat.error.code);
    expect(chat.data.messages.map((message) => message.system)).toContainEqual({
      key: "stop_added",
      stop: { is: "N1 Mosfellsbæ", en: "N1 Mosfellsbær" },
      plannedAt: preview.data.plannedTimes[1],
    });
  });

  it("takes bookings from the new stop at its own price, and search finds it; a part chosen before it was added is refused", async () => {
    const anna = await driverOf(north);
    const query = { from: point("mosfellsbaer"), to: point("borgarnes") };
    const before = await api.client.call(tripSearchRoute, { query });
    expect(before.ok && before.data.results).toEqual([]);
    const saved = await change(anna, north, addStop("mosfellsbaer"));
    if (!saved.ok) throw new Error(saved.error.code);
    const found = await api.client.call(tripSearchRoute, { query });
    expect(found.ok && found.data.results).toMatchObject([
      { tripId: north, board: { position: 1, plannedAt: saved.data.plannedTimes[1] } },
    ]);
    const shown = await details(north, 1, 2);
    expect(shown.part.total).toEqual(saved.data.prices[1]);
    const sigga = await newMember("Sigga");
    // Chosen before the stop was added: Borgarnes to Blönduós were 1 and 2.
    const stale = await book(sigga.accessToken, north, {
      fromStop: 1,
      toStop: 2,
      fromPoint: point("borgarnes"),
      toPoint: point("blonduos"),
    });
    expect(!stale.ok && [stale.status, stale.error.code]).toEqual([409, "stops_changed"]);
    const moved = await book(sigga.accessToken, north, {
      fromStop: 1,
      toStop: 2,
      fromPoint: point("mosfellsbaer"),
      toPoint: point("blonduos"),
    });
    expect(!moved.ok && moved.error.code).toBe("stops_changed");
    const booking = await booked(sigga.accessToken, north, {
      fromStop: 1,
      toStop: 2,
      fromPoint: point("mosfellsbaer"),
      toPoint: point("borgarnes"),
    });
    expect(booking).toMatchObject({
      board: { meetingPoint: { id: point("mosfellsbaer") } },
      alight: { meetingPoint: { id: point("borgarnes") } },
      total: saved.data.prices[1],
    });
    expect(await occupancy(north)).toEqual([0, 1, 0, 0]);
  });

  it("waits for a pause of the stop under way, then refuses it (spec 2, 3.6.4)", async () => {
    const anna = await driverOf(north);
    // The console's pause holds the point while it counts the trips to tell.
    const pausing = await api.connection.pool.connect();
    try {
      await pausing.query("BEGIN");
      await pausing.query("SELECT 1 FROM meeting_points WHERE id = $1 FOR UPDATE", [
        point("mosfellsbaer"),
      ]);
      let answered = false;
      const adding = change(anna, north, addStop("mosfellsbaer")).finally(() => {
        answered = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(answered).toBe(false);
      await pausing.query("UPDATE meeting_points SET status = 'paused' WHERE id = $1", [
        point("mosfellsbaer"),
      ]);
      await pausing.query("COMMIT");
      expect(await adding).toMatchObject({
        status: 422,
        error: { details: [{ path: "meetingPointId", issue: "stop_unavailable" }] },
      });
    } finally {
      await pausing.query("ROLLBACK");
      pausing.release();
      await api.connection.db
        .update(schema.meetingPoints)
        .set({ status: "active" })
        .where(eq(schema.meetingPoints.id, point("mosfellsbaer")));
    }
    expect(await stopsOf(north)).toHaveLength(4);
  });

  it("refuses a stop that does not fit between its neighbours, one on the trip, and one not in use", async () => {
    const anna = await driverOf(north);
    // Akranes is 80 minutes off the way to Borgarnes, an hour after BSÍ.
    expect(await change(anna, north, addStop("akranes"), true)).toMatchObject({
      status: 422,
      error: {
        code: "change_not_allowed",
        details: [{ path: "segments.0", issue: "stop_does_not_fit" }],
      },
    });
    expect(await change(anna, north, addStop("borgarnes"))).toMatchObject({
      status: 422,
      error: { details: [{ path: "stops.1", issue: "stop_on_trip" }] },
    });
    await api.connection.db
      .update(schema.meetingPoints)
      .set({ status: "paused" })
      .where(eq(schema.meetingPoints.id, point("stadarskali")));
    try {
      expect(await change(anna, north, addStop("stadarskali"))).toMatchObject({
        status: 422,
        error: { details: [{ path: "meetingPointId", issue: "stop_unavailable" }] },
      });
    } finally {
      await api.connection.db
        .update(schema.meetingPoints)
        .set({ status: "active" })
        .where(eq(schema.meetingPoints.id, point("stadarskali")));
    }
    expect(
      await change(anna, north, { kind: "addStop", meetingPointId: sampleId("not a point") }),
    ).toMatchObject({
      status: 422,
      error: { details: [{ path: "meetingPointId", issue: "stop_unavailable" }] },
    });
    expect(await stopsOf(north)).toHaveLength(4);
    expect(await changesOf(north)).toEqual([]);
  });

  it("waits for the distances to a new meeting point", async () => {
    const [bsi] = await api.connection.db
      .select()
      .from(schema.meetingPoints)
      .where(eq(schema.meetingPoints.id, point("bsi")));
    if (bsi === undefined) throw new Error("The sample points are missing.");
    const fresh = sampleId("test:new-stop");
    await api.connection.db
      .insert(schema.meetingPoints)
      .values({ ...bsi, id: fresh, nameIs: "Nýr staður" })
      .onConflictDoNothing();
    const anna = await driverOf(north);
    expect(await change(anna, north, { kind: "addStop", meetingPointId: fresh })).toMatchObject({
      status: 503,
      error: { code: "distances_pending", retryAfterSeconds: 60 },
    });
    await api.connection.db.delete(schema.meetingPoints).where(eq(schema.meetingPoints.id, fresh));
  });
});

describe("removing a stop (spec 6, 3.2; R6.5)", () => {
  /** Gunna's paid booking from `fromStop` to `toStop`, cancelled by her. */
  async function cancelledBooking(anna: Member, fromStop: number, toStop: number) {
    const gunna = await newMember("Gunna");
    const booking = await paidBooking(anna, gunna, fromStop, toStop);
    const terms = await cancelling(gunna, booking.id, "plans_changed");
    if (terms === undefined) throw new Error("No terms");
    const cancelled = await api.client.call(cancelBookingRoute, {
      accessToken: gunna.accessToken,
      params: { id: booking.id },
      body: {
        reason: "plans_changed",
        terms: { refund: terms.refund, countsOnReliability: terms.countsOnReliability },
      },
    });
    if (!cancelled.ok) throw new Error(cancelled.error.code);
    return { gunna, booking };
  }

  it("joins the stretches either side of a stop no booking uses; the other stops keep their times, bookings their totals, and each booked passenger is told", async () => {
    const anna = await driverOf(north);
    const gunna = await newMember("Gunna");
    const dora = await newMember("Dóra");
    const whole = await paidBooking(anna, gunna);
    const blonduos = await booked(dora.accessToken, north, { fromStop: 2, toStop: 3 });
    await accepted(anna, blonduos.id);
    await booked((await newMember("Óli")).accessToken, north, { fromStop: 2, toStop: 3 });
    const timesBefore = await timesOf(anna, north);
    const pricesBefore = await pricesOf(whole.id);
    const segmentsBefore = await segmentsOf(north);
    const borgarnes = (await stopsOf(north))[1];

    const preview = await change(anna, north, removeStop("borgarnes"), true);
    if (!preview.ok) throw new Error(preview.error.code);
    expect(await stopsOf(north)).toHaveLength(4);
    expect(preview.data).toMatchObject({ told: 2, requests: 1, freeCancellations: 0 });
    expect(preview.data.stops).toEqual(["bsi", "blonduos", "akureyri"].map(point));
    expect(preview.data.plannedTimes).toEqual(
      timesBefore.filter((_, index) => index !== 1).map(iso),
    );
    // The way past Borgarnes priced for new bookings; the last stretch as it was.
    expect(preview.data.prices).toHaveLength(2);
    expect(preview.data.prices[1]?.amount).toBe(segmentsBefore[2]?.price);
    expect(preview.data.prices[0]?.amount).toBeGreaterThan(segmentsBefore[1]?.price ?? 0);

    const saved = await change(anna, north, removeStop("borgarnes"));
    expect(saved.ok && saved.data).toEqual(preview.data);
    const stops = await stopsOf(north);
    expect(stops.map((stop) => stop.meetingPointId)).toEqual(preview.data.stops);
    expect(stops.map((stop) => stop.position)).toEqual([0, 1, 2]);
    expect((await timesOf(anna, north)).map(iso)).toEqual(preview.data.plannedTimes);
    // Kept for the bookings that once got in or out there, and removed.
    const [kept] = await api.connection.db
      .select({ removedAt: schema.tripStops.removedAt })
      .from(schema.tripStops)
      .where(eq(schema.tripStops.id, borgarnes?.id ?? ""));
    expect(kept?.removedAt).toEqual(api.now());

    const segments = await segmentsOf(north);
    expect(segments.map((segment) => segment.position)).toEqual([0, 1]);
    expect(segments.map((segment) => segment.price)).toEqual(
      preview.data.prices.map(({ amount }) => amount),
    );
    expect(segments.map((segment) => [segment.fromStopId, segment.toStopId])).toEqual([
      [stops[0]?.id, stops[1]?.id],
      [stops[1]?.id, stops[2]?.id],
    ]);
    // The way past is the leg from BSÍ to Blönduós.
    const [leg] = await api.connection.db
      .select({ distanceM: schema.legs.distanceM, durationS: schema.legs.durationS })
      .from(schema.legs)
      .where(
        and(
          eq(schema.legs.fromMeetingPointId, point("bsi")),
          eq(schema.legs.toMeetingPointId, point("blonduos")),
        ),
      );
    expect(segments[0]).toMatchObject({ ...leg, occupancy: 1 });
    expect(segments.map((segment) => segment.capacity)).toEqual([3, 3]);
    expect(await occupancy(north)).toEqual([1, 3]);
    expect(await heldByBookings(north)).toEqual([1, 3]);

    // Gunna keeps her total: her prices for the two stretches are added (rule P1).
    const prices = await pricesOf(whole.id);
    expect(prices).toEqual([
      { position: 0, price: (pricesBefore[0]?.price ?? 0) + (pricesBefore[1]?.price ?? 0) },
      { position: 1, price: pricesBefore[2]?.price },
    ]);
    expect((await pricesOf(blonduos.id)).map((row) => row.position)).toEqual([1]);
    const gunnaReads = await read(gunna, whole.id);
    expect(gunnaReads).toMatchObject({
      total: whole.total,
      board: { position: 0, meetingPoint: { id: point("bsi") } },
      alight: { position: 2, meetingPoint: { id: point("akureyri") } },
    });
    expect(gunnaReads.changes).toEqual([
      {
        kind: "removeStop",
        stop: { is: "N1 Borgarnesi", en: "N1 Borgarnes" },
        changedAt: expect.any(String) as unknown,
      },
    ]);
    expect((await read(dora, blonduos.id)).board.position).toBe(1);

    // Recorded, and told on the booking, in the chat and by an event each (spec 7, 3.3).
    const [recorded] = await changesOf(north);
    expect(await changesOf(north)).toEqual([
      {
        id: expect.any(String) as unknown,
        kind: "removeStop",
        before: {
          meetingPointId: point("borgarnes"),
          nameIs: "N1 Borgarnesi",
          nameEn: "N1 Borgarnes",
          plannedAt: iso(timesBefore[1] ?? new Date()),
        },
        after: {},
      },
    ]);
    expect((await eventsOf("TripChanged")).map(({ payload }) => payload)).toEqual([
      { bookingId: whole.id, tripChangeId: recorded?.id },
      { bookingId: blonduos.id, tripChangeId: recorded?.id },
    ]);
    expect(await chatOf(gunna, whole.id)).toContainEqual({
      key: "stop_removed",
      stop: { is: "N1 Borgarnesi", en: "N1 Borgarnes" },
    });
  });

  it("refuses a stop where a booking or request gets in or out, the first or last stop, and a point not on the trip", async () => {
    const anna = await driverOf(north);
    const dora = await newMember("Dóra");
    const request = await booked(dora.accessToken, north, { fromStop: 1, toStop: 2 });
    for (const key of ["borgarnes", "blonduos"]) {
      expect(await change(anna, north, removeStop(key), true)).toMatchObject({
        status: 422,
        error: {
          code: "change_not_allowed",
          details: [{ path: "meetingPointId", issue: "stop_in_use" }],
          bookingsAtStop: 1,
        },
      });
    }
    for (const key of ["bsi", "akureyri"]) {
      expect(await change(anna, north, removeStop(key))).toMatchObject({
        status: 422,
        error: { details: [{ path: "meetingPointId", issue: "stop_at_end" }] },
      });
    }
    expect(await change(anna, north, removeStop("mosfellsbaer"))).toMatchObject({
      status: 422,
      error: { details: [{ path: "meetingPointId", issue: "stop_not_on_trip" }] },
    });
    expect(await stopsOf(north)).toHaveLength(4);
    expect(await changesOf(north)).toEqual([]);
    // The request still stands, on its stops.
    expect(await read(dora, request.id)).toMatchObject({
      status: "requested",
      board: { position: 1, meetingPoint: { id: point("borgarnes") } },
    });
  });

  it("keeps the stop a cancelled booking got in at, which the booking still names", async () => {
    const anna = await driverOf(north);
    const { gunna, booking } = await cancelledBooking(anna, 1, 2);
    const saved = await change(anna, north, removeStop("borgarnes"));
    expect(saved.ok).toBe(true);
    expect(await read(gunna, booking.id)).toMatchObject({
      status: "cancelled",
      total: booking.total,
      board: { meetingPoint: { id: point("borgarnes") } },
      alight: { meetingPoint: { id: point("blonduos") } },
    });
    // Its price follows the stretch it was on, now the way past Borgarnes.
    expect((await pricesOf(booking.id)).map((row) => row.position)).toEqual([0]);
    // A cancelled booking is not told.
    expect(await eventsOf("TripChanged")).toEqual([]);
    // Cancelled once more, by the driver on a screen left open, it answers
    // as it did before the stop went.
    const again = await api.client.call(cancelBookingRoute, {
      accessToken: anna.accessToken,
      params: { id: booking.id },
      body: {
        reason: "passenger_asked",
        terms: { refund: { amount: 0, currency: "ISK" }, countsOnReliability: false },
      },
    });
    expect(again.ok ? "ok" : [again.status, again.error.code]).toEqual([
      409,
      "booking_not_cancellable",
    ]);
  });

  it("is no longer found from the stop, refuses a part chosen before, and can take the stop back", async () => {
    const anna = await driverOf(north);
    const query = { from: point("borgarnes"), to: point("akureyri") };
    const before = await api.client.call(tripSearchRoute, { query });
    expect(before.ok && before.data.results).toMatchObject([{ tripId: north }]);
    expect((await change(anna, north, removeStop("borgarnes"))).ok).toBe(true);
    const after = await api.client.call(tripSearchRoute, { query });
    expect(after.ok && after.data.results).toEqual([]);
    const shown = await details(north, 1, 2);
    expect(shown.stops.map((stop) => stop.meetingPoint.id)).toEqual(
      ["bsi", "blonduos", "akureyri"].map(point),
    );

    // Chosen before the stop was removed: Blönduós to Akureyri were 2 and 3.
    const sigga = await newMember("Sigga");
    const stale = await book(sigga.accessToken, north, {
      fromStop: 1,
      toStop: 2,
      fromPoint: point("borgarnes"),
      toPoint: point("blonduos"),
    });
    expect(!stale.ok && [stale.status, stale.error.code]).toEqual([409, "stops_changed"]);

    // The driver can add it back: it is a new stop, in its old place.
    const back = await change(anna, north, addStop("borgarnes"));
    if (!back.ok) throw new Error(back.error.code);
    expect(back.data.stops).toEqual(["bsi", "borgarnes", "blonduos", "akureyri"].map(point));
    expect(await stopsOf(north)).toHaveLength(4);
    const again = await api.client.call(tripSearchRoute, { query });
    expect(again.ok && again.data.results).toMatchObject([{ tripId: north }]);
    expect((await changesOf(north)).map((each) => each.kind)).toEqual(["removeStop", "addStop"]);
  });

  it("lists the trip once among the rides leaving soonest, to its last stop", async () => {
    const anna = await driverOf(north);
    // The last stop takes the place Blönduós leaves, which stays marked.
    expect((await change(anna, north, removeStop("blonduos"))).ok).toBe(true);
    const soonest = await api.client.call(soonestTripsRoute, { query: { limit: 50 } });
    if (!soonest.ok) throw new Error(soonest.error.code);
    expect(soonest.data.results.filter((result) => result.tripId === north)).toMatchObject([
      {
        board: { position: 0, meetingPoint: { id: point("bsi") } },
        alight: { position: 2, meetingPoint: { id: point("akureyri") } },
      },
    ]);
  });

  it("waits for the distance between the stops either side", async () => {
    const anna = await driverOf(north);
    const pastBorgarnes = and(
      eq(schema.legs.fromMeetingPointId, point("bsi")),
      eq(schema.legs.toMeetingPointId, point("blonduos")),
    );
    const [leg] = await api.connection.db.select().from(schema.legs).where(pastBorgarnes);
    if (leg === undefined) throw new Error("The sample legs are missing.");
    await api.connection.db.delete(schema.legs).where(pastBorgarnes);
    try {
      expect(await change(anna, north, removeStop("borgarnes"))).toMatchObject({
        status: 503,
        error: { code: "distances_pending" },
      });
    } finally {
      await api.connection.db.insert(schema.legs).values(leg);
    }
    expect(await stopsOf(north)).toHaveLength(4);
  });
});
