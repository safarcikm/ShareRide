import {
  bookingRoute,
  cancelBookingRoute,
  cancellationPreviewRoute,
  conversationMessagesRoute,
  driverCheckInRoute,
  myTripRoute,
  passengerCheckInRoute,
  tripBookingsRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { asc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";

// "I'm here" (spec 8, 3.2; R8.3). At the test clock (Friday 13 November
// 2026, noon), Jón's airport trip leaves Hlemmur on Saturday at 05:30 and
// stops at Fjörður, Fitjar and Keflavík Airport; it takes instant bookings.

let api: TestApi;

const { airport, north } = sampleTrip;

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  await freshSampleTrips(api);
  await api.connection.db
    .delete(schema.outboxEvents)
    .where(eq(schema.outboxEvents.kind, "CheckedIn"));
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, later, rewind, driverOf, booked, paid } = bookingHelpers(() => api);

const minute = 60;

/** The airport trip's stops, in order. */
async function stopsOf(tripId: string) {
  const rows = await api.connection.db
    .select({ id: schema.tripStops.id, plannedAt: schema.tripStops.plannedAt })
    .from(schema.tripStops)
    .where(eq(schema.tripStops.tripId, tripId))
    .orderBy(asc(schema.tripStops.position));
  return rows.map(({ id, plannedAt }) => {
    if (plannedAt === null) throw new Error("A published trip's stop has its time.");
    return { id, plannedAt };
  });
}

/** Moves the clock to `minutes` from `time`, refreshing the members' tokens. */
async function until(time: Date, minutes: number, ...members: Member[]) {
  const seconds = (time.getTime() - api.now().getTime()) / 1000 + minutes * minute;
  await later(Math.round(seconds), ...members);
}

/** A confirmed booking of a new member's on the airport trip, to the airport unless told. */
async function rider(name: string, fromStop: number, toStop = 3) {
  const member = await newMember(name);
  const booking = await booked(member.accessToken, airport, { fromStop, toStop });
  await paid(member.accessToken, booking.id);
  return { member, booking };
}

const passengerCheckIn = (member: Member, bookingId: string) =>
  api.client.call(passengerCheckInRoute, {
    accessToken: member.accessToken,
    params: { id: bookingId },
    body: {},
  });

const driverCheckIn = (member: Member, tripId: string, stopId: string) =>
  api.client.call(driverCheckInRoute, {
    accessToken: member.accessToken,
    params: { id: tripId, stopId },
    body: {},
  });

async function checkedInEvents() {
  return api.connection.db
    .select({ payload: schema.outboxEvents.payload })
    .from(schema.outboxEvents)
    .where(eq(schema.outboxEvents.kind, "CheckedIn"))
    .orderBy(asc(schema.outboxEvents.createdAt), asc(schema.outboxEvents.id));
}

async function chatOf(member: Member, bookingId: string) {
  const chat = await api.client.call(conversationMessagesRoute, {
    accessToken: member.accessToken,
    params: { id: bookingId },
    query: {},
  });
  if (!chat.ok) throw new Error(chat.error.code);
  return chat.data.messages.flatMap((message) => (message.system === null ? [] : [message.system]));
}

async function bookingAs(member: Member, bookingId: string) {
  const found = await api.client.call(bookingRoute, {
    accessToken: member.accessToken,
    params: { id: bookingId },
  });
  if (!found.ok) throw new Error(found.error.code);
  return found.data;
}

/** The passenger cancels, with the terms the preview shows. */
async function cancelled(member: Member, bookingId: string) {
  const preview = await api.client.call(cancellationPreviewRoute, {
    accessToken: member.accessToken,
    params: { id: bookingId },
  });
  if (!preview.ok) throw new Error(preview.error.code);
  const [{ reason, refund, countsOnReliability }] = preview.data.reasons as [
    (typeof preview.data.reasons)[number],
  ];
  const result = await api.client.call(cancelBookingRoute, {
    accessToken: member.accessToken,
    params: { id: bookingId },
    body: { reason, terms: { refund, countsOnReliability } },
  });
  if (!result.ok) throw new Error(result.error.code);
}

async function tripAs(member: Member, tripId: string) {
  const found = await api.client.call(myTripRoute, {
    accessToken: member.accessToken,
    params: { id: tripId },
  });
  if (!found.ok) throw new Error(found.error.code);
  return found.data;
}

describe("the passenger's \"I'm here\" (spec 8, 3.2; R8.3)", () => {
  it("opens 30 minutes before their stop; the driver is told once, and both conversations show it", async () => {
    const jon = await driverOf(airport, "Jón");
    const { member: gunna, booking } = await rider("Gunna", 0);
    const stops = await stopsOf(airport);
    const [hlemmur] = stops;
    const airportStop = stops.at(-1);
    if (hlemmur === undefined || airportStop === undefined) throw new Error("No stops.");
    const minutesFrom = (time: Date, minutes: number) =>
      new Date(time.getTime() + minutes * 60_000).toISOString();

    expect((await bookingAs(gunna, booking.id)).tripDay).toEqual({
      phase: "upcoming",
      checkInOpensAt: minutesFrom(hlemmur.plannedAt, -30),
      checkInClosesAt: minutesFrom(hlemmur.plannedAt, 60),
      passengerCheckedInAt: null,
      driverCheckedInAt: null,
      // The reports open after the 10-minute wait (R8.4, R8.5), and close
      // when the trip completes, 2 hours after its last stop, or 24 hours later.
      reportOpensAt: minutesFrom(hlemmur.plannedAt, 10),
      noShowClosesAt: minutesFrom(airportStop.plannedAt, 120),
      driverAbsentClosesAt: minutesFrom(airportStop.plannedAt, 120 + 24 * 60),
      arrival: "not_here",
    });

    await until(hlemmur.plannedAt, -31, gunna, jon);
    expect(await passengerCheckIn(gunna, booking.id)).toMatchObject({
      ok: false,
      status: 409,
      error: {
        code: "check_in_not_open",
        opensAt: new Date(hlemmur.plannedAt.getTime() - 30 * 60_000).toISOString(),
      },
    });

    await later(minute, gunna, jon);
    const checkedInAt = api.now().toISOString();
    expect(await passengerCheckIn(gunna, booking.id)).toMatchObject({
      ok: true,
      status: 200,
      data: { stopId: hlemmur.id, checkedInAt },
    });
    expect(await checkedInEvents()).toEqual([
      { payload: { bookingId: booking.id, by: "passenger" } },
    ]);
    expect((await chatOf(gunna, booking.id))[0]).toEqual({ key: "checked_in", by: "me" });
    expect((await chatOf(jon, booking.id))[0]).toEqual({ key: "checked_in", by: "them" });

    // A repeat answers with the first and tells nobody again.
    await later(5 * minute, gunna, jon);
    expect(await passengerCheckIn(gunna, booking.id)).toMatchObject({
      ok: true,
      data: { stopId: hlemmur.id, checkedInAt },
    });
    expect(await checkedInEvents()).toHaveLength(1);
    expect(
      (await chatOf(gunna, booking.id)).filter((line) => line.key === "checked_in"),
    ).toHaveLength(1);

    expect((await bookingAs(gunna, booking.id)).tripDay).toMatchObject({
      phase: "trip_day",
      passengerCheckedInAt: checkedInAt,
      driverCheckedInAt: null,
      arrival: "here",
    });
  });

  it("shows the driver who is at their stop and who is not here yet, and each passenger only their own", async () => {
    const jon = await driverOf(airport, "Jón");
    const gunna = await rider("Gunna", 0);
    // The car has two seats: Óli gets out at Fjörður before Sigga gets in.
    const oli = await rider("Óli", 0, 1);
    const sigga = await rider("Sigga", 2);
    const [hlemmur] = await stopsOf(airport);
    if (hlemmur === undefined) throw new Error("No stop at Hlemmur.");
    await until(hlemmur.plannedAt, -10, gunna.member, oli.member, jon);
    await passengerCheckIn(gunna.member, gunna.booking.id);
    // Óli gets in at the same stop and sees nothing of Gunna's.
    expect((await bookingAs(oli.member, oli.booking.id)).tripDay).toMatchObject({
      passengerCheckedInAt: null,
      arrival: "not_here",
    });
    expect(await checkedInEvents()).toEqual([
      { payload: { bookingId: gunna.booking.id, by: "passenger" } },
    ]);

    const onTrip = await api.client.call(tripBookingsRoute, {
      accessToken: jon.accessToken,
      params: { id: airport },
    });
    if (!onTrip.ok) throw new Error(onTrip.error.code);
    const arrivalOf = (id: string) =>
      onTrip.data.bookings.find((booking) => booking.id === id)?.tripDay?.arrival;
    expect(arrivalOf(gunna.booking.id)).toBe("here");
    expect(arrivalOf(oli.booking.id)).toBe("not_here");
    expect(arrivalOf(sigga.booking.id)).toBe("not_here");
  });

  it("starts afresh with a new booking at the same stop", async () => {
    const jon = await driverOf(airport, "Jón");
    const { member: gunna, booking: first } = await rider("Gunna", 0);
    const [hlemmur] = await stopsOf(airport);
    if (hlemmur === undefined) throw new Error("No stop at Hlemmur.");
    // "I'm here" opens 30 minutes before the stop; booking closes 15 before.
    await until(hlemmur.plannedAt, -25, gunna, jon);
    await passengerCheckIn(gunna, first.id);
    await cancelled(gunna, first.id);
    // The check-in stays with the booking it was for.
    expect(await passengerCheckIn(gunna, first.id)).toMatchObject({ ok: true });

    const second = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 3 });
    await paid(gunna.accessToken, second.id);
    expect((await bookingAs(gunna, second.id)).tripDay).toMatchObject({
      passengerCheckedInAt: null,
      arrival: "not_here",
    });
    await later(minute, gunna, jon);
    expect(await passengerCheckIn(gunna, second.id)).toMatchObject({
      ok: true,
      data: { checkedInAt: api.now().toISOString() },
    });
    expect(await checkedInEvents()).toEqual([
      { payload: { bookingId: first.id, by: "passenger" } },
      { payload: { bookingId: second.id, by: "passenger" } },
    ]);
  });

  it("keeps the trip day on a booking that completed or was a no-show", async () => {
    const jon = await driverOf(airport, "Jón");
    const gunna = await rider("Gunna", 0);
    const oli = await rider("Óli", 0);
    const { db } = api.connection;
    await db
      .update(schema.bookings)
      .set({ status: "completed", completedAt: api.now() })
      .where(eq(schema.bookings.id, gunna.booking.id));
    await db
      .update(schema.bookings)
      .set({ status: "no_show" })
      .where(eq(schema.bookings.id, oli.booking.id));
    expect((await bookingAs(gunna.member, gunna.booking.id)).tripDay).toMatchObject({
      phase: "upcoming",
      arrival: "not_here",
    });
    expect((await bookingAs(jon, oli.booking.id)).tripDay).toMatchObject({ arrival: "no_show" });
  });

  it("is refused without a confirmed booking, and once the hour after the stop has passed", async () => {
    await driverOf(airport, "Jón");
    const dora = await newMember("Dóra");
    const unpaid = await booked(dora.accessToken, airport, { fromStop: 1, toStop: 3 });
    expect(await passengerCheckIn(dora, unpaid.id)).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "not_confirmed" },
    });
    expect((await bookingAs(dora, unpaid.id)).tripDay).toBeNull();

    const { member: sigga, booking: gone } = await rider("Sigga", 1);
    await cancelled(sigga, gone.id);
    expect(await passengerCheckIn(sigga, gone.id)).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "not_confirmed" },
    });

    const { member: gunna, booking } = await rider("Gunna", 0);
    const [hlemmur] = await stopsOf(airport);
    if (hlemmur === undefined) throw new Error("No stop at Hlemmur.");
    await until(hlemmur.plannedAt, 61, gunna);
    expect(await passengerCheckIn(gunna, booking.id)).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "check_in_closed" },
    });
    expect(await checkedInEvents()).toEqual([]);
  });

  it("is only for the booking's passenger", async () => {
    const jon = await driverOf(airport, "Jón");
    const { booking } = await rider("Gunna", 0);
    const stranger = await newMember("Óli");
    for (const member of [jon, stranger]) {
      expect(await passengerCheckIn(member, booking.id)).toMatchObject({
        ok: false,
        status: 404,
        error: { code: "not_found" },
      });
    }
  });
});

describe("the driver's \"I'm here\" (spec 8, 3.2; R8.3)", () => {
  it("tells each confirmed passenger getting in at that stop, once, and nobody else", async () => {
    const jon = await driverOf(airport, "Jón");
    const gunna = await rider("Gunna", 0);
    const sigga = await rider("Sigga", 2);
    const dora = await newMember("Dóra");
    await booked(dora.accessToken, airport, { fromStop: 0, toStop: 1 });
    const [hlemmur, , fitjar] = await stopsOf(airport);
    if (hlemmur === undefined || fitjar === undefined) throw new Error("No such stops.");

    expect((await tripAs(jon, airport)).phase).toBe("upcoming");
    await until(hlemmur.plannedAt, -10, jon, gunna.member, sigga.member);
    const checkedInAt = api.now().toISOString();
    expect(await driverCheckIn(jon, airport, hlemmur.id)).toMatchObject({
      ok: true,
      status: 200,
      data: { stopId: hlemmur.id, checkedInAt },
    });
    // Dóra never paid, and Sigga gets in at Fitjar.
    expect(await checkedInEvents()).toEqual([
      { payload: { bookingId: gunna.booking.id, by: "driver" } },
    ]);
    expect((await chatOf(gunna.member, gunna.booking.id))[0]).toEqual({
      key: "checked_in",
      by: "them",
    });
    expect((await bookingAs(gunna.member, gunna.booking.id)).tripDay).toMatchObject({
      driverCheckedInAt: checkedInAt,
      passengerCheckedInAt: null,
    });
    expect((await bookingAs(sigga.member, sigga.booking.id)).tripDay?.driverCheckedInAt).toBeNull();

    const trip = await tripAs(jon, airport);
    expect(trip.phase).toBe("trip_day");
    expect(trip.stops.map((stop) => stop.id)).toEqual((await stopsOf(airport)).map((s) => s.id));
    expect(trip.stops[0]?.checkIn).toEqual({
      opensAt: new Date(hlemmur.plannedAt.getTime() - 30 * 60_000).toISOString(),
      closesAt: new Date(hlemmur.plannedAt.getTime() + 60 * 60_000).toISOString(),
      at: checkedInAt,
    });
    expect(trip.stops[2]?.checkIn?.at).toBeNull();

    await later(minute, jon);
    expect(await driverCheckIn(jon, airport, hlemmur.id)).toMatchObject({
      ok: true,
      data: { stopId: hlemmur.id, checkedInAt },
    });
    expect(await checkedInEvents()).toHaveLength(1);

    // Not yet at Fitjar: it opens 30 minutes before.
    expect(await driverCheckIn(jon, airport, fitjar.id)).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "check_in_not_open" },
    });

    // At Fjörður nobody gets in: it is stored, and nobody is told.
    const [, fjordur] = await stopsOf(airport);
    if (fjordur === undefined) throw new Error("No stop at Fjörður.");
    await until(fjordur.plannedAt, 0, jon);
    expect(await driverCheckIn(jon, airport, fjordur.id)).toMatchObject({ ok: true });
    expect(await checkedInEvents()).toHaveLength(1);
    expect((await tripAs(jon, airport)).stops[1]?.checkIn?.at).toBe(api.now().toISOString());
  });

  it("is only for the trip's driver, at a stop of that trip", async () => {
    const jon = await driverOf(airport, "Jón");
    const { member: gunna } = await rider("Gunna", 0);
    const [hlemmur] = await stopsOf(airport);
    const [elsewhere] = await stopsOf(north);
    if (hlemmur === undefined || elsewhere === undefined) throw new Error("No such stops.");
    await until(hlemmur.plannedAt, -10, jon, gunna);
    const [, fjordur] = await stopsOf(airport);
    if (fjordur === undefined) throw new Error("No stop at Fjörður.");
    await api.connection.db
      .update(schema.tripStops)
      .set({ removedAt: api.now() })
      .where(eq(schema.tripStops.id, fjordur.id));
    for (const [member, stopId] of [
      [gunna, hlemmur.id],
      [jon, elsewhere.id],
      [jon, fjordur.id],
    ] as const) {
      expect(await driverCheckIn(member, airport, stopId)).toMatchObject({
        ok: false,
        status: 404,
        error: { code: "not_found" },
      });
    }
  });

  it("is refused on a draft", async () => {
    const jon = await driverOf(airport, "Jón");
    const [hlemmur] = await stopsOf(airport);
    if (hlemmur === undefined) throw new Error("No stop at Hlemmur.");
    await until(hlemmur.plannedAt, -10, jon);
    await api.connection.db
      .update(schema.trips)
      .set({ status: "draft", publishedAt: null })
      .where(eq(schema.trips.id, airport));
    expect(await driverCheckIn(jon, airport, hlemmur.id)).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "trip_not_running" },
    });
  });

  it("is refused on a cancelled trip", async () => {
    const jon = await driverOf(airport, "Jón");
    const [hlemmur] = await stopsOf(airport);
    if (hlemmur === undefined) throw new Error("No stop at Hlemmur.");
    await api.connection.db
      .update(schema.trips)
      .set({ status: "cancelled", cancelledAt: api.now(), cancelReason: "illness" })
      .where(eq(schema.trips.id, airport));
    const cancelled = await tripAs(jon, airport);
    expect(cancelled.phase).toBeNull();
    expect(cancelled.stops[0]?.checkIn).toBeNull();
    await until(hlemmur.plannedAt, -10, jon);
    expect(await driverCheckIn(jon, airport, hlemmur.id)).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "trip_not_running" },
    });
  });
});
