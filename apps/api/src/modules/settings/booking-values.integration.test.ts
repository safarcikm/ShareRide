import { randomUUID } from "node:crypto";
import {
  acceptRequestRoute,
  bookingRoute,
  bookTripRoute,
  cancelBookingRoute,
  cancellationPreviewRoute,
  changeTripRoute,
  myTripRoute,
  type AdminSettings,
  type Booking,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";

// The booking and cancellation values from the settings (spec 10, 3.2;
// R10.3; ADR 0032; milestone 11, PR 12). A booking keeps the cancellation
// values of the version it was made under; deadlines, the cut-off and how
// far a departure can move are read as they are now. One database for the
// whole file: the history cannot be emptied, so each test sets what it needs.

let api: TestApi;
let operator: { cookie: string };

const { north, vik } = sampleTrip;
const minuteMs = 60_000;

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  await freshSampleTrips(api);
  operator = await api.signInOperator();
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, later, rewind, driverOf, details, booked, paid } = bookingHelpers(() => api);

async function send(method: string, path: string, body?: unknown) {
  const response = await api.request(path, {
    method,
    headers: { cookie: operator.cookie, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

/** Sets a setting, unless it has the value already. */
async function set(key: string, value: number) {
  const now = (await send("GET", "/admin/v1/settings")).body as AdminSettings;
  if (now.settings.find((setting) => setting.key === key)?.value === value) return;
  const changed = await send("PATCH", `/admin/v1/settings/${key}`, {
    value,
    reason: "A test.",
    version: now.version,
  });
  if (changed.status !== 200) throw new Error(JSON.stringify(changed.body));
}

async function stored(id: string) {
  const [row] = await api.connection.db
    .select()
    .from(schema.bookings)
    .where(eq(schema.bookings.id, id));
  if (row === undefined) throw new Error("No such booking.");
  return row;
}

/** A paid booking of the whole of Jón's Sunday trip from Selfoss to Vík. */
async function paidOnVik(passenger: Member) {
  const booking = await booked(passenger.accessToken, vik, { fromStop: 0, toStop: 1 });
  await paid(passenger.accessToken, booking.id);
  return booking;
}

async function shownTerms(member: Member, id: string) {
  const shown = await api.client.call(cancellationPreviewRoute, {
    accessToken: member.accessToken,
    params: { id },
  });
  if (!shown.ok) throw new Error(shown.error.code);
  const option = shown.data.reasons.find((offered) => offered.reason === "plans_changed");
  if (option === undefined) throw new Error("The reason is not offered.");
  return { refund: option.refund, countsOnReliability: option.countsOnReliability };
}

async function seen(member: Member, id: string) {
  const booking = await api.client.call(bookingRoute, {
    accessToken: member.accessToken,
    params: { id },
  });
  if (!booking.ok) throw new Error(booking.error.code);
  return booking.data;
}

const untilBoarding = (booking: Booking) =>
  (new Date(booking.board.plannedAt).getTime() - api.now().getTime()) / 1000;

const none = { amount: 0, currency: "ISK" } as const;

describe("a booking's cancellation values (R10.3)", () => {
  it("refunds a booking by the rule it was made under, and a later one by the new rule", async () => {
    await set("free_cancellation_until", 15);
    const ari = await newMember("Ari");
    const bea = await newMember("Bea");
    const before = await paidOnVik(ari);
    await set("free_cancellation_until", 60);
    const after = await paidOnVik(bea);
    expect((await stored(after.id)).settingsVersion).toBeGreaterThan(
      (await stored(before.id)).settingsVersion,
    );

    // Half an hour before they get in: inside the new hour, outside the old 15 minutes.
    await later(untilBoarding(before) - 30 * 60, ari, bea);
    expect(await shownTerms(ari, before.id)).toMatchObject({ refund: before.total });
    expect(await shownTerms(bea, after.id)).toMatchObject({ refund: none });

    const cancelled = await api.client.call(cancelBookingRoute, {
      accessToken: ari.accessToken,
      params: { id: before.id },
      body: { reason: "plans_changed", terms: await shownTerms(ari, before.id) },
    });
    expect(cancelled).toMatchObject({
      status: 200,
      data: { status: "cancelled", cancellation: { refund: before.total } },
    });
  });

  it("counts a cancellation by the window the booking was made under", async () => {
    await set("reliability_cancellation_window", 24);
    const ari = await newMember("Ari");
    const bea = await newMember("Bea");
    const before = await paidOnVik(ari);
    await set("reliability_cancellation_window", 2);
    const after = await paidOnVik(bea);

    await later(untilBoarding(before) - 3 * 3600, ari, bea);
    expect(await shownTerms(ari, before.id)).toMatchObject({ countsOnReliability: true });
    expect(await shownTerms(bea, after.id)).toMatchObject({ countsOnReliability: false });
  });

  it("takes a move as far by each booking's own value, and lets the departure move as far as it may now", async () => {
    await set("major_time_change", 30);
    await set("max_time_change", 30);
    const jon = await driverOf(vik, "Jón");
    const ari = await newMember("Ari");
    const bea = await newMember("Bea");
    const before = await paidOnVik(ari);
    await set("major_time_change", 20);
    const after = await paidOnVik(bea);

    const trip = await api.client.call(myTripRoute, {
      accessToken: jon.accessToken,
      params: { id: vik },
    });
    if (!trip.ok) throw new Error(trip.error.code);
    const leaves = new Date(trip.data.departsAt ?? 0);
    const move = (minutes: number) =>
      api.client.call(changeTripRoute, {
        accessToken: jon.accessToken,
        params: { id: vik },
        query: { preview: false },
        body: {
          kind: "departure",
          departsAt: new Date(leaves.getTime() + minutes * minuteMs).toISOString(),
        },
      });

    // 45 minutes is more than a departure may move now.
    const tooFar = await move(45);
    expect(tooFar).toMatchObject({ status: 422, error: { code: "change_not_allowed" } });
    expect(!tooFar.ok && tooFar.error.details?.map((detail) => detail.issue)).toEqual([
      "move_too_far",
    ]);

    // 25 minutes: far for the booking made under 20, not for the one made under 30.
    expect(await move(25)).toMatchObject({ status: 200, data: { told: 2, freeCancellations: 1 } });
    expect((await seen(ari, before.id)).movedFar).toBe(false);
    expect((await seen(bea, after.id)).movedFar).toBe(true);
  });
});

describe("booking's values as they are now", () => {
  it("gives a new request and a new acceptance the deadlines of the values now", async () => {
    await set("request_expiry", 2);
    await set("payment_window", 45);
    const anna = await driverOf(north);
    const ari = await newMember("Ari");
    const request = await booked(ari.accessToken, north, { fromStop: 1, toStop: 2 });
    const now = api.now().getTime();
    expect((await stored(request.id)).expiresAt?.getTime()).toBe(now + 2 * 3600 * 1000);

    const accepted = await api.client.call(acceptRequestRoute, {
      accessToken: anna.accessToken,
      params: { id: request.id },
      body: {},
    });
    expect(accepted).toMatchObject({ status: 200 });
    expect((await stored(request.id)).paymentDueAt?.getTime()).toBe(now + 45 * minuteMs);
  });

  it("closes booking by the cut-off as it is now", async () => {
    await set("booking_cutoff", 15);
    const ari = await newMember("Ari");
    const bea = await newMember("Bea");
    const [trip] = await api.connection.db
      .select({ departsAt: schema.trips.departsAt })
      .from(schema.trips)
      .where(eq(schema.trips.id, vik));
    const price = (await details(vik, 0, 1)).part.total;
    const tryToBook = (member: Member) =>
      api.client.call(bookTripRoute, {
        accessToken: member.accessToken,
        params: { id: vik },
        body: {
          fromStop: 0,
          toStop: 1,
          seats: 1,
          total: price,
          message: "",
          attemptKey: randomUUID(),
        },
      });

    // 45 minutes before the trip leaves: open with a cut-off of 15 minutes.
    const untilItLeaves = ((trip?.departsAt?.getTime() ?? 0) - api.now().getTime()) / 1000;
    await later(untilItLeaves - 45 * 60, ari, bea);
    expect(await tryToBook(ari)).toMatchObject({ status: 201 });

    operator = await api.signInOperator();
    await set("booking_cutoff", 60);
    expect(await tryToBook(bea)).toMatchObject({ status: 409, error: { code: "booking_closed" } });
    await set("booking_cutoff", 15);
  });
});
