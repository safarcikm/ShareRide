import {
  setPushTokenRoute,
  type AdminMeetingPoint,
  type AdminMeetingPointMoved,
  type ErrorResponse,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { sampleId, samplePoints } from "@shareride/db/seed";
import { metresMoved, type Position } from "@shareride/domain";
import { and, asc, eq, like, or, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createFakeEmailSender } from "../../platform/email.ts";
import { createFakePushSender, type PushSender } from "../../platform/push.ts";
import { createDevSmsSender, type DevSmsSender } from "../../platform/sms.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  hours,
  sampleTrip,
  seedForBookings,
} from "../bookings/testing.ts";
import { createNotificationWorker } from "../notifications/worker.ts";

// Moving a meeting point in service (spec 2, 3.6.6; R2.10). The sample
// trips at the test clock (Friday 13 November 2026, noon): Jón drives
// Hlemmur, Fjörður, N1 Fitjar and Keflavík Airport on Saturday at 05:30.
// No trip stops at Kringlan. The tests' router draws straight lines and
// finds no road south of 63.3° N.

let api: TestApi;
let cookie: string;
let sms: DevSmsSender;

const { airport } = sampleTrip;
const fitjar = sampleId("point:fitjar");
const kringlan = sampleId("point:kringlan");
const bsi = sampleId("point:bsi");
const { auditLog, legs, meetingPoints, notifications, notificationDeliveries, outboxEvents } =
  schema;

const sampleSpot = (key: string): Position => {
  const found = samplePoints.find((point) => point.key === key);
  if (found === undefined) throw new Error(`No sample point ${key}.`);
  return found.position;
};
/** `metres` north of a spot. */
const north = (from: Position, metres: number): Position => ({
  latitude: Math.round((from.latitude + metres / 111_195) * 1e6) / 1e6,
  longitude: from.longitude,
});

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  cookie = (await api.signInOperator()).cookie;
  await freshSampleTrips(api);
  const { db } = api.connection;
  // The sample points where the seed puts them, in use.
  for (const point of samplePoints) {
    await db
      .update(meetingPoints)
      .set({ location: point.position, status: "active" })
      .where(eq(meetingPoints.id, sampleId(`point:${point.key}`)));
  }
  await db.execute(sql`delete from outbox_events`);
  await db.execute(sql`delete from notifications`);
  sms = createDevSmsSender({ print: () => undefined });
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, later, rewind, driverOf, booked, paid } = bookingHelpers(() => api);

function worker(options: { push?: PushSender } = {}) {
  return createNotificationWorker({
    db: api.connection.db,
    clock: () => api.now(),
    push: options.push ?? createFakePushSender(),
    email: { sender: createFakeEmailSender(), webAppUrl: "https://shareride.test" },
    sms,
  });
}

async function point(id: string): Promise<AdminMeetingPoint> {
  const response = await api.request(`/admin/v1/meeting-points/${id}`, { headers: { cookie } });
  if (response.status !== 200) throw new Error(`No point: ${String(response.status)}`);
  return (await response.json()) as AdminMeetingPoint;
}

async function move(
  id: string,
  position: Position,
  options: { updatedAt?: string; as?: string } = {},
) {
  const updatedAt = options.updatedAt ?? (await point(id)).updatedAt;
  const response = await api.request(`/admin/v1/meeting-points/${id}/move`, {
    method: "POST",
    headers: { cookie: options.as ?? cookie, "content-type": "application/json" },
    body: JSON.stringify({ position, updatedAt }),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

const legBetween = async (from: string, to: string) => {
  const [found] = await api.connection.db
    .select()
    .from(legs)
    .where(and(eq(legs.fromMeetingPointId, from), eq(legs.toMeetingPointId, to)));
  return found;
};

const legsOf = (id: string) =>
  api.connection.db
    .select()
    .from(legs)
    .where(or(eq(legs.fromMeetingPointId, id), eq(legs.toMeetingPointId, id)));

const movedEntries = (id: string) =>
  api.connection.db
    .select({ before: auditLog.before, after: auditLog.after })
    .from(auditLog)
    .where(and(eq(auditLog.action, "meeting_point.moved"), eq(auditLog.subjectId, id)))
    .orderBy(asc(auditLog.createdAt));

/** Notifications of a moved point made so far, by kind and whom. */
const told = () =>
  api.connection.db
    .select({
      kind: notifications.kind,
      recipientId: notifications.recipientId,
      bookingId: notifications.bookingId,
      tripId: notifications.tripId,
      meetingPointId: notifications.meetingPointId,
    })
    .from(notifications)
    .where(like(notifications.kind, "meeting_point_moved%"))
    .orderBy(asc(notifications.createdAt), asc(notifications.kind));

describe("POST /admin/v1/meeting-points/{id}/move", () => {
  it("needs a console session", async () => {
    const { status } = await move(kringlan, north(sampleSpot("kringlan"), 100), {
      updatedAt: new Date().toISOString(),
      as: "sr_operator=sr_os_not-a-session",
    });
    expect(status).toBe(401);
  });

  it("moves a point within 50 m with its legs computed again, telling nobody", async () => {
    const to = north(sampleSpot("fitjar"), 30);
    const before = await legBetween(fitjar, bsi);
    const { status, body } = await move(fitjar, to);
    expect(status).toBe(200);
    const moved = body as AdminMeetingPointMoved;
    expect(moved).toMatchObject({ metres: 30, tripsTold: 0 });
    expect(moved.meetingPoint).toMatchObject({ position: to, status: "active", futureTrips: 1 });
    const after = await legBetween(fitjar, bsi);
    expect(after?.distanceM).not.toBe(before?.distanceM);
    expect(await api.connection.db.$count(outboxEvents)).toBe(0);

    const [entry] = (await movedEntries(fitjar)).slice(-1);
    expect(entry).toEqual({
      before: { position: sampleSpot("fitjar") },
      after: {
        position: to,
        metres: 30,
        legs: expect.any(Number) as unknown,
        missing: expect.any(Number) as unknown,
        tripsTold: 0,
      },
    });
  });

  it("tells the driver of each future trip once, and each passenger who gets in or out there, beyond 50 m", async () => {
    const [anna, bjarni, gunna] = await Promise.all([
      newMember("Anna"),
      newMember("Bjarni"),
      newMember("Gunna"),
    ]);
    const jon = await driverOf(airport, "Jón");
    await api.client.call(setPushTokenRoute, {
      accessToken: jon.accessToken,
      body: { token: "ExponentPushToken[jon]" },
    });
    // Anna gets out at Fitjar and has paid; Gunna gets in there and has not
    // paid yet; Bjarni only passes through.
    const annas = await booked(anna.accessToken, airport, { fromStop: 0, toStop: 2 });
    await paid(anna.accessToken, annas.id);
    const gunnas = await booked(gunna.accessToken, airport, { fromStop: 2, toStop: 3 });
    const bjarnis = await booked(bjarni.accessToken, airport, { fromStop: 1, toStop: 3 });
    await paid(bjarni.accessToken, bjarnis.id);

    const to = north(sampleSpot("fitjar"), 300);
    const { status, body } = await move(fitjar, to);
    expect(status).toBe(200);
    expect(body).toMatchObject({ metres: metresMoved(sampleSpot("fitjar"), to), tripsTold: 1 });
    const events = await api.connection.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.kind, "MeetingPointMoved"));
    expect(events.map((event) => [event.kind, event.payload])).toEqual([
      ["MeetingPointMoved", { tripId: airport, meetingPointId: fitjar }],
    ]);
    // The trip itself is not changed.
    const [trip] = await api.connection.db
      .select({ status: schema.trips.status })
      .from(schema.trips)
      .where(eq(schema.trips.id, airport));
    expect(trip?.status).toBe("published");

    const push = createFakePushSender();
    await worker({ push }).runOnce();
    await worker({ push }).runOnce();
    expect(push.sent.filter((message) => message.title.startsWith("Meeting point"))).toEqual([
      {
        to: "ExponentPushToken[jon]",
        title: "Meeting point moved: N1 Fitjar",
        body: expect.stringMatching(
          /^Your trip stops there: Saturday 14 November at \d\d:\d\d\. See where it is now before you go\.$/,
        ) as unknown,
        data: { path: `/drive/trips/${airport}` },
      },
    ]);
    const made = await told();
    expect(made).toHaveLength(3);
    expect(made).toEqual(
      expect.arrayContaining([
        {
          kind: "meeting_point_moved_driver",
          recipientId: jon.userId,
          bookingId: null,
          tripId: airport,
          meetingPointId: fitjar,
        },
        {
          kind: "meeting_point_moved",
          recipientId: anna.userId,
          bookingId: annas.id,
          tripId: null,
          meetingPointId: fitjar,
        },
        {
          kind: "meeting_point_moved",
          recipientId: gunna.userId,
          bookingId: gunnas.id,
          tripId: null,
          meetingPointId: fitjar,
        },
      ]),
    );
    // Both board within 24 hours, so the passengers also get an SMS (spec 7, 3.4).
    expect(sms.outbox.map((message) => message.text)).toEqual([
      "PuffinRide: the meeting point for your trip on Saturday 14 November has changed. Details in the app.",
      "PuffinRide: the meeting point for your trip on Saturday 14 November has changed. Details in the app.",
    ]);
    const [entry] = (await movedEntries(fitjar)).slice(-1);
    expect(entry?.after).toMatchObject({ tripsTold: 1 });
  });

  it("drops the news once the trip has passed the point, for the driver and the passengers", async () => {
    const jon = await driverOf(airport, "Jón");
    const anna = await newMember("Anna");
    // Anna gets out at Fitjar and has paid.
    const annas = await booked(anna.accessToken, airport, { fromStop: 0, toStop: 2 });
    await paid(anna.accessToken, annas.id);
    for (const [who, token] of [
      [jon, "ExponentPushToken[jon]"],
      [anna, "ExponentPushToken[anna]"],
    ] as const) {
      await api.client.call(setPushTokenRoute, {
        accessToken: who.accessToken,
        body: { token },
      });
    }
    await move(fitjar, north(sampleSpot("fitjar"), 300));
    const push = createFakePushSender();
    push.failure = new Error("The push service is down.");
    await worker({ push }).runOnce();
    await worker({ push }).runOnce();
    // Saturday at noon: the trip passed Fitjar in the morning.
    await later(hours(24));
    push.failure = null;
    await worker({ push }).runOnce();
    expect(push.sent.filter((message) => message.title.startsWith("Meeting point"))).toEqual([]);
    const tries = await api.connection.db
      .select({
        kind: notifications.kind,
        status: notificationDeliveries.status,
        reason: notificationDeliveries.reason,
      })
      .from(notificationDeliveries)
      .innerJoin(notifications, eq(notifications.id, notificationDeliveries.notificationId))
      .where(
        and(
          like(notifications.kind, "meeting_point_moved%"),
          eq(notificationDeliveries.channel, "push"),
        ),
      )
      .orderBy(asc(notifications.kind));
    expect(tries).toEqual([
      { kind: "meeting_point_moved", status: "skipped", reason: "no_longer_applies" },
      { kind: "meeting_point_moved_driver", status: "skipped", reason: "no_longer_applies" },
    ]);
  });

  it("moves a paused point too, and its legs stay with the points in service", async () => {
    await api.connection.db
      .update(meetingPoints)
      .set({ status: "paused", pauseReasonIs: "Lokað.", pauseReasonEn: "Closed." })
      .where(eq(meetingPoints.id, kringlan));
    const { status } = await move(kringlan, north(sampleSpot("kringlan"), 80));
    expect(status).toBe(200);
    expect((await legsOf(kringlan)).length).toBeGreaterThan(0);
  });

  it("refuses a draft, a retired point and a copy older than the point's", async () => {
    const entriesBefore = (await movedEntries(kringlan)).length;
    for (const status of ["draft", "retired"] as const) {
      await api.connection.db
        .update(meetingPoints)
        .set({ status })
        .where(eq(meetingPoints.id, kringlan));
      const refused = await move(kringlan, north(sampleSpot("kringlan"), 100));
      expect(refused.status, status).toBe(409);
      expect((refused.body as ErrorResponse).error.code, status).toBe("move_not_allowed");
    }
    const stale = await move(fitjar, north(sampleSpot("fitjar"), 100), {
      updatedAt: "2026-11-01T00:00:00.000Z",
    });
    expect(stale.status).toBe(409);
    expect((stale.body as ErrorResponse).error.code).toBe("meeting_point_changed");
    expect(await movedEntries(kringlan)).toHaveLength(entriesBefore);
  });

  it("refuses a spot outside Iceland, the spot it is at, and one no road reaches", async () => {
    const refusals: [Position, string][] = [
      [{ latitude: 60.0, longitude: -21.9 }, "outside_iceland"],
      [sampleSpot("fitjar"), "same_place"],
      // In Iceland's box, at sea off the south coast.
      [{ latitude: 63.25, longitude: -20.0 }, "no_road"],
    ];
    for (const [to, issue] of refusals) {
      const { status, body } = await move(fitjar, to);
      expect(status, issue).toBe(400);
      expect((body as ErrorResponse).error).toMatchObject({
        code: "validation_failed",
        details: [{ path: "position", issue }],
      });
    }
    expect((await point(fitjar)).position).toEqual(sampleSpot("fitjar"));
  });

  it("knows no such point", async () => {
    const { status } = await move(sampleId("point:nowhere"), north(sampleSpot("fitjar"), 100), {
      updatedAt: "2026-11-01T00:00:00.000Z",
    });
    expect(status).toBe(404);
  });
});
