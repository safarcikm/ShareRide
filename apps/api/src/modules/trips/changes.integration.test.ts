import {
  acceptRequestRoute,
  bookingRoute,
  cancelBookingRoute,
  cancellationPreviewRoute,
  cancelTripRoute,
  changeTripRoute,
  conversationMessagesRoute,
  myTripRoute,
  type TripChangeBody,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { asc, eq, sql } from "drizzle-orm";
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

const { newMember, later, rewind, driverOf, details, book, booked, paid, occupancy } =
  bookingHelpers(() => api);

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
    expect(booking.changes.map(({ from, to }) => [from, to])).toEqual([
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
