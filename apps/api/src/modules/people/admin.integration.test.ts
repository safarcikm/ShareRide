import {
  cancelBookingRoute,
  cancellationPreviewRoute,
  cancelTripRoute,
  type AdminExcusedCancellation,
  type AdminWatchedPerson,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import type { CancelReason } from "@shareride/domain";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";

// The console's Reliability page (spec 8, 3.8; R8.10, R8.11; milestone 7,
// PR 7d). At the test clock (Friday 13 November 2026, noon), the airport
// trip leaves Hlemmur on Saturday at 05:30, less than 24 hours ahead, and
// both it and the Vík trip book at once. All made up.

let api: TestApi;

const { airport, north, vik } = sampleTrip;
const { bookings, trips, users } = schema;

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

const { newMember, later, rewind, driverOf, booked, paid } = bookingHelpers(() => api);

async function send(cookie: string, method: string, path: string) {
  const response = await api.request(path, {
    method,
    headers: { cookie, "content-type": "application/json" },
    ...(method === "POST" ? { body: "{}" } : {}),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

async function listed(cookie: string) {
  const { status, body } = await send(cookie, "GET", "/admin/v1/reliability/cancellations");
  expect(status).toBe(200);
  return (body as { cancellations: AdminExcusedCancellation[] }).cancellations;
}

/** The passenger cancels their paid booking for `reason`, on the terms the preview gives. */
async function passengerCancels(passenger: Member, bookingId: string, reason: CancelReason) {
  const preview = await api.client.call(cancellationPreviewRoute, {
    accessToken: passenger.accessToken,
    params: { id: bookingId },
  });
  if (!preview.ok) throw new Error(preview.error.code);
  const terms = preview.data.reasons.find((offered) => offered.reason === reason);
  if (terms === undefined) throw new Error(`${reason} is not offered.`);
  const cancelled = await api.client.call(cancelBookingRoute, {
    accessToken: passenger.accessToken,
    params: { id: bookingId },
    body: {
      reason,
      terms: { refund: terms.refund, countsOnReliability: terms.countsOnReliability },
    },
  });
  if (!cancelled.ok) throw new Error(cancelled.error.code);
}

/** A paid booking of a new member on `tripId`, from its first stop to its second. */
async function paidRide(name: string, tripId: string) {
  const member = await newMember(name);
  const booking = await booked(member.accessToken, tripId, { fromStop: 0, toStop: 1 });
  await paid(member.accessToken, booking.id);
  return { member, bookingId: booking.id };
}

/** Jón cancels the Vík trip, which Sigga paid for, for the weather. */
async function vikCancelledForWeather() {
  const jon = await driverOf(vik, "Jón");
  await paidRide("Sigga", vik);
  const cancelled = await api.client.call(cancelTripRoute, {
    accessToken: jon.accessToken,
    params: { id: vik },
    body: { reason: "weather", countsOnReliability: false },
  });
  if (!cancelled.ok) throw new Error(cancelled.error.code);
  return jon;
}

async function auditOf(action: string, subjectId: string) {
  return api.connection.db
    .select()
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.action, action), eq(schema.auditLog.subjectId, subjectId)))
    .orderBy(asc(schema.auditLog.id));
}

describe("the console's Reliability routes", () => {
  it("are for operators only", async () => {
    const gunna = await newMember("Gunna");
    for (const [method, path] of [
      ["GET", "/admin/v1/reliability/cancellations"],
      ["POST", `/admin/v1/reliability/cancellations/trip/${vik}/overrule`],
      ["GET", "/admin/v1/reliability/watch"],
    ] as const) {
      const answered = await api.request(path, {
        method,
        headers: {
          authorization: `Bearer ${gunna.accessToken}`,
          "content-type": "application/json",
        },
        ...(method === "POST" ? { body: "{}" } : {}),
      });
      expect(answered.status, path).toBe(401);
    }
  });
});

describe("cancellations excused by their reason (R8.11)", () => {
  it("lists a trip and a late booking cancelled for the weather, newest first", async () => {
    const jon = await vikCancelledForWeather();
    await driverOf(airport, "Anna");
    const gunna = await paidRide("Gunna", airport);
    await later(60, gunna.member);
    // Less than 24 hours before boarding: it would count, but for the weather.
    await passengerCancels(gunna.member, gunna.bookingId, "weather");

    const { cookie } = await api.signInOperator();
    const cancellations = await listed(cookie);
    expect(cancellations).toMatchObject([
      {
        kind: "booking",
        id: gunna.bookingId,
        person: { userId: gunna.member.userId, firstName: "Gunna" },
        role: "passenger",
        reason: "weather",
        overruledAt: null,
      },
      {
        kind: "trip",
        id: vik,
        person: { userId: jon.userId, firstName: "Jón" },
        role: "driver",
        reason: "weather",
        note: "",
        overruledAt: null,
      },
    ]);
    expect(cancellations[1]?.from.is).toEqual(expect.any(String));
  });

  it("leaves out cancellations that count anyway, or never would", async () => {
    // Without a passenger, the trip never counts, whatever the reason.
    const jon = await driverOf(vik, "Jón");
    await api.client.call(cancelTripRoute, {
      accessToken: jon.accessToken,
      params: { id: vik },
      body: { reason: "weather", countsOnReliability: false },
    });
    // For another reason, a late cancellation counts.
    await driverOf(airport, "Anna");
    const gunna = await paidRide("Gunna", airport);
    await passengerCancels(gunna.member, gunna.bookingId, "plans_changed");

    const { cookie } = await api.signInOperator();
    expect(await listed(cookie)).toEqual([]);
  });

  it("overrules one so that it counts, once, with an audit entry", async () => {
    await vikCancelledForWeather();
    const signedIn = await api.signInOperator();
    const path = `/admin/v1/reliability/cancellations/trip/${vik}/overrule`;
    const first = await send(signedIn.cookie, "POST", path);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      kind: "trip",
      id: vik,
      overruledAt: api.now().toISOString(),
    });
    const [stored] = await api.connection.db
      .select({ counts: trips.countsOnReliability, overruledAt: trips.overruledAt })
      .from(trips)
      .where(eq(trips.id, vik));
    expect(stored).toEqual({ counts: true, overruledAt: api.now() });
    expect(await auditOf("trip.reason_overruled", vik)).toMatchObject([
      {
        operatorUserId: signedIn.userId,
        operatorSessionId: signedIn.sessionId,
        subjectType: "trip",
        before: { countsOnReliability: false },
        after: { countsOnReliability: true },
      },
    ]);

    const again = await send(signedIn.cookie, "POST", path);
    expect(again).toMatchObject({ status: 409, body: { error: { code: "already_overruled" } } });
    expect(await auditOf("trip.reason_overruled", vik)).toHaveLength(1);
    // Still listed, as overruled.
    expect((await listed(signedIn.cookie))[0]?.overruledAt).toBe(api.now().toISOString());
  });

  it("overrules a booking's reason, and finds no cancellation that was not excused", async () => {
    await driverOf(airport, "Anna");
    const gunna = await paidRide("Gunna", airport);
    await passengerCancels(gunna.member, gunna.bookingId, "weather");
    const sigga = await paidRide("Sigga", airport);
    await passengerCancels(sigga.member, sigga.bookingId, "plans_changed");
    const { cookie } = await api.signInOperator();

    const overruled = await send(
      cookie,
      "POST",
      `/admin/v1/reliability/cancellations/booking/${gunna.bookingId}/overrule`,
    );
    expect(overruled.status).toBe(200);
    const [stored] = await api.connection.db
      .select({ counts: bookings.countsOnReliability })
      .from(bookings)
      .where(eq(bookings.id, gunna.bookingId));
    expect(stored?.counts).toBe(true);

    for (const path of [
      `/admin/v1/reliability/cancellations/booking/${sigga.bookingId}/overrule`,
      `/admin/v1/reliability/cancellations/trip/${gunna.bookingId}/overrule`,
      `/admin/v1/reliability/cancellations/trip/${north}/overrule`,
    ]) {
      expect((await send(cookie, "POST", path)).status, path).toBe(404);
    }
  });
});

describe("people below the watch level (spec 8, 3.8.4)", () => {
  it("lists those below 80% from 5 that count, lowest first, and no one else", async () => {
    const { db } = api.connection;
    await driverOf(airport, "Anna");
    const gunna = await paidRide("Gunna", airport);
    const dora = await paidRide("Dóra", airport);
    const copies = async (bookingId: string, kept: number, broken: number) => {
      const [row] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
      if (row === undefined) throw new Error("No such booking.");
      const copy = (changes: Partial<typeof bookings.$inferInsert>) =>
        db
          .insert(bookings)
          .values({ ...row, id: crypto.randomUUID(), attemptKey: crypto.randomUUID(), ...changes });
      for (let made = 0; made < kept; made += 1) {
        await copy({ status: "completed", completedAt: api.now() });
      }
      for (let made = 0; made < broken; made += 1) {
        await copy({
          status: "cancelled",
          cancelledAt: api.now(),
          cancelledBy: "passenger",
          countsOnReliability: true,
        });
      }
    };
    // Gunna kept 3 of 5 (60%), Dóra 4 of 5 (80%, not below), and Siggi 2
    // of 4, too few to show a figure.
    await copies(gunna.bookingId, 3, 2);
    await copies(dora.bookingId, 4, 1);
    await driverOf(vik, "Jón");
    const siggi = await paidRide("Siggi", vik);
    await copies(siggi.bookingId, 2, 2);

    const { cookie } = await api.signInOperator();
    const { status, body } = await send(cookie, "GET", "/admin/v1/reliability/watch");
    expect(status).toBe(200);
    const { watchPercent, people } = body as { watchPercent: number; people: AdminWatchedPerson[] };
    expect(watchPercent).toBe(80);
    expect(people).toEqual([
      {
        userId: gunna.member.userId,
        firstName: "Gunna",
        reliability: {
          kept: 3,
          counted: 5,
          percent: 60,
          byRole: { driver: { kept: 0, counted: 0 }, passenger: { kept: 3, counted: 5 } },
        },
      },
    ]);

    // Someone leaving ShareRide is not watched any more.
    await db
      .update(users)
      .set({ deleteAfter: new Date(api.now().getTime() + 86_400_000) })
      .where(eq(users.id, gunna.member.userId));
    const after = await send(cookie, "GET", "/admin/v1/reliability/watch");
    expect((after.body as { people: AdminWatchedPerson[] }).people).toEqual([]);
  });
});
