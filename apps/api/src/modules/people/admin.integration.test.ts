import {
  cancelBookingRoute,
  cancellationPreviewRoute,
  cancelTripRoute,
  publicProfileRoute,
  type AdminExcusedCancellation,
  type AdminWatchedPerson,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import type { CancelReason } from "@shareride/domain";
import { and, asc, eq, gte } from "drizzle-orm";
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

async function send(cookie: string, method: string, path: string, body: unknown = {}) {
  const response = await api.request(path, {
    method,
    headers: { cookie, "content-type": "application/json" },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

const countsPath = (kind: "trip" | "booking", id: string) =>
  `/admin/v1/reliability/cancellations/${kind}/${id}/counts`;

/** The operator makes it count, or no longer count, with a note. */
const change = (cookie: string, kind: "trip" | "booking", id: string, counts = true) =>
  send(cookie, "POST", countsPath(kind, id), {
    counts,
    note: counts ? "Clear skies and open roads all day." : "Pressed by mistake.",
  });

async function listed(cookie: string) {
  const { status, body } = await send(cookie, "GET", "/admin/v1/reliability/cancellations");
  expect(status).toBe(200);
  return (body as { cancellations: AdminExcusedCancellation[] }).cancellations;
}

/** The passenger (or the driver) cancels a paid booking for `reason`, on the terms the preview gives. */
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

// The audit log refuses deletes, so entries of earlier tests on the same
// sample trip stay: each test looks at those since it began (`from`, on the
// database's own clock, not the test clock).
async function auditOf(action: string, subjectId: string, from = new Date(0)) {
  return api.connection.db
    .select()
    .from(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.action, action),
        eq(schema.auditLog.subjectId, subjectId),
        gte(schema.auditLog.createdAt, from),
      ),
    )
    .orderBy(asc(schema.auditLog.id));
}

describe("the console's Reliability routes", () => {
  it("are for operators only", async () => {
    const gunna = await newMember("Gunna");
    for (const [method, path] of [
      ["GET", "/admin/v1/reliability/cancellations"],
      ["POST", countsPath("trip", vik)],
      ["GET", "/admin/v1/reliability/watch"],
    ] as const) {
      const answered = await api.request(path, {
        method,
        headers: {
          authorization: `Bearer ${gunna.accessToken}`,
          "content-type": "application/json",
        },
        ...(method === "POST" ? { body: JSON.stringify({ counts: true, note: "No." }) } : {}),
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
        overruleNote: "",
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

  it("names the driver who cancelled one booking for a closed road", async () => {
    const anna = await driverOf(airport, "Anna");
    const gunna = await paidRide("Gunna", airport);
    await later(60, gunna.member);
    await passengerCancels(anna, gunna.bookingId, "road_closed");
    const { cookie } = await api.signInOperator();
    expect(await listed(cookie)).toMatchObject([
      {
        kind: "booking",
        id: gunna.bookingId,
        person: { userId: anna.userId, firstName: "Anna" },
        role: "driver",
        reason: "road_closed",
      },
    ]);
  });

  it("leaves out someone leaving PuffinRide, and what is older than the period", async () => {
    const jon = await vikCancelledForWeather();
    const { cookie } = await api.signInOperator();
    expect(await listed(cookie)).toHaveLength(1);
    await api.connection.db
      .update(users)
      .set({ deleteAfter: new Date(api.now().getTime() + 7 * 86_400_000) })
      .where(eq(users.id, jon.userId));
    expect(await listed(cookie)).toEqual([]);
    // Nor can it be changed: undoing their deletion brings them back as they were.
    expect((await change(cookie, "trip", vik)).status).toBe(404);

    await api.connection.db
      .update(users)
      .set({ deleteAfter: null })
      .where(eq(users.id, jon.userId));
    // Twelve months and a day ago.
    await api.connection.db
      .update(trips)
      .set({ cancelledAt: new Date(api.now().getTime() - 366 * 86_400_000) })
      .where(eq(trips.id, vik));
    expect(await listed(cookie)).toEqual([]);
    expect((await change(cookie, "trip", vik)).status).toBe(404);
    const [stored] = await api.connection.db
      .select({ counts: trips.countsOnReliability })
      .from(trips)
      .where(eq(trips.id, vik));
    expect(stored?.counts).toBe(false);
  });

  it("overrules one so that it counts, with a note and an audit entry, and undoes it", async () => {
    const from = new Date();
    const jon = await vikCancelledForWeather();
    const signedIn = await api.signInOperator();
    const driverCounted = async () => {
      const [found] = await api.connection.db
        .select({ profileId: users.profileId })
        .from(users)
        .where(eq(users.id, jon.userId));
      const viewer = await newMember("Dóra");
      const profile = await api.client.call(publicProfileRoute, {
        accessToken: viewer.accessToken,
        params: { profileId: found?.profileId ?? "" },
      });
      if (!profile.ok) throw new Error(profile.error.code);
      return profile.data.reliability.byRole.driver;
    };
    expect(await driverCounted()).toEqual({ kept: 0, counted: 0 });

    const overruledAt = api.now();
    const first = await change(signedIn.cookie, "trip", vik);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      kind: "trip",
      id: vik,
      overruledAt: overruledAt.toISOString(),
      overruleNote: "Clear skies and open roads all day.",
    });
    const stored = () =>
      api.connection.db
        .select({
          counts: trips.countsOnReliability,
          overruledAt: trips.overruledAt,
          note: trips.overruleNote,
        })
        .from(trips)
        .where(eq(trips.id, vik));
    expect(await stored()).toEqual([
      { counts: true, overruledAt, note: "Clear skies and open roads all day." },
    ]);
    // It now counts on Jón's figure, as not kept.
    expect(await driverCounted()).toEqual({ kept: 0, counted: 1 });
    expect(await auditOf("trip.reason_overruled", vik, from)).toMatchObject([
      {
        operatorUserId: signedIn.userId,
        operatorSessionId: signedIn.sessionId,
        subjectType: "trip",
        before: null,
        // The names of the fields only, never the note.
        after: { changed: ["countsOnReliability", "overruledAt", "overruleNote"] },
      },
    ]);
    const again = await change(signedIn.cookie, "trip", vik);
    expect(again).toMatchObject({ status: 409, body: { error: { code: "unchanged" } } });
    expect(await auditOf("trip.reason_overruled", vik, from)).toHaveLength(1);
    // Still listed, as overruled.
    expect((await listed(signedIn.cookie))[0]?.overruledAt).toBe(overruledAt.toISOString());

    const undone = await change(signedIn.cookie, "trip", vik, false);
    expect(undone).toMatchObject({
      status: 200,
      body: { overruledAt: null, overruleNote: "Pressed by mistake." },
    });
    expect(await stored()).toEqual([
      { counts: false, overruledAt: null, note: "Pressed by mistake." },
    ]);
    expect(await driverCounted()).toEqual({ kept: 0, counted: 0 });
    expect(await auditOf("trip.overrule_undone", vik, from)).toHaveLength(1);
    expect((await change(signedIn.cookie, "trip", vik, false)).status).toBe(409);
  });

  it("needs a note of up to 500 characters", async () => {
    const from = new Date();
    await vikCancelledForWeather();
    const { cookie } = await api.signInOperator();
    for (const [note, issue] of [
      ["   ", "missing"],
      ["x".repeat(501), "too_long"],
    ] as const) {
      expect(
        await send(cookie, "POST", countsPath("trip", vik), { counts: true, note }),
      ).toMatchObject({
        status: 400,
        body: { error: { code: "validation_failed", details: [{ path: "note", issue }] } },
      });
    }
    expect(await auditOf("trip.reason_overruled", vik, from)).toEqual([]);
  });

  it("overrules a booking's reason, and finds no cancellation that was not excused", async () => {
    await driverOf(airport, "Anna");
    const gunna = await paidRide("Gunna", airport);
    await passengerCancels(gunna.member, gunna.bookingId, "weather");
    const sigga = await paidRide("Sigga", airport);
    await passengerCancels(sigga.member, sigga.bookingId, "plans_changed");
    const { cookie } = await api.signInOperator();

    expect((await change(cookie, "booking", gunna.bookingId)).status).toBe(200);
    const [stored] = await api.connection.db
      .select({ counts: bookings.countsOnReliability })
      .from(bookings)
      .where(eq(bookings.id, gunna.bookingId));
    expect(stored?.counts).toBe(true);
    expect(await auditOf("booking.reason_overruled", gunna.bookingId)).toHaveLength(1);

    for (const [kind, id] of [
      ["booking", sigga.bookingId],
      ["trip", gunna.bookingId],
      ["trip", north],
    ] as const) {
      expect((await change(cookie, kind, id)).status, `${kind} ${id}`).toBe(404);
    }
    expect(
      (
        await send(cookie, "POST", `/admin/v1/reliability/cancellations/person/${vik}/counts`, {
          counts: true,
          note: "No.",
        })
      ).status,
    ).toBe(400);
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

    // Someone leaving PuffinRide is not watched any more.
    await db
      .update(users)
      .set({ deleteAfter: new Date(api.now().getTime() + 86_400_000) })
      .where(eq(users.id, gunna.member.userId));
    const after = await send(cookie, "GET", "/admin/v1/reliability/watch");
    expect((after.body as { people: AdminWatchedPerson[] }).people).toEqual([]);
  });
});
