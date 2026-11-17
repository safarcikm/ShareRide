import {
  setPushTokenRoute,
  type AdminMeetingPoint,
  type ErrorResponse,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { sampleId } from "@shareride/db/seed";
import { and, asc, eq, like, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createFakeEmailSender } from "../../platform/email.ts";
import { createFakePushSender, type PushSender } from "../../platform/push.ts";
import { createDevSmsSender, type DevSmsSender, type SmsSender } from "../../platform/sms.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  hours,
  sampleTrip,
  seedForBookings,
} from "../bookings/testing.ts";
import { createNotificationWorker } from "../notifications/worker.ts";
import { moveMeetingPointsOn } from "./status.ts";

// Pausing, bringing back and retiring a meeting point (spec 2, 3.6.4 and
// 3.6.5). The sample trips at the test clock (Friday 13 November 2026,
// noon): Jón drives Hlemmur, Fjörður, N1 Fitjar and Keflavík Airport on
// Saturday at 05:30 (instant, paid). No trip stops at Kringlan.

let api: TestApi;
let cookie: string;
let sms: DevSmsSender;

const { airport } = sampleTrip;
const fitjar = sampleId("point:fitjar");
const kringlan = sampleId("point:kringlan");
const { meetingPoints, notifications, notificationDeliveries, outboxEvents } = schema;

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  await signInAgain();
  await freshSampleTrips(api);
  const { db } = api.connection;
  // The sample points as the seed makes them: it keeps a status the console gave.
  await db
    .update(meetingPoints)
    .set({
      status: "active",
      pauseReasonIs: null,
      pauseReasonEn: null,
      pausedUntil: null,
      lastCheckedOn: null,
      reviewDueOn: null,
    })
    .where(eq(meetingPoints.sample, true));
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

/** A console session as of the test clock: one from before a long wait has expired. */
async function signInAgain() {
  cookie = (await api.signInOperator()).cookie;
}

function worker(options: { sms?: SmsSender; push?: PushSender } = {}) {
  return createNotificationWorker({
    db: api.connection.db,
    clock: () => api.now(),
    push: options.push ?? createFakePushSender(),
    email: { sender: createFakeEmailSender(), webAppUrl: "https://shareride.test" },
    sms: options.sms ?? sms,
  });
}

async function send(path: string, body: unknown, withCookie = cookie) {
  const response = await api.request(path, {
    method: "POST",
    headers: { cookie: withCookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

async function point(id: string): Promise<AdminMeetingPoint> {
  const response = await api.request(`/admin/v1/meeting-points/${id}`, { headers: { cookie } });
  if (response.status !== 200) throw new Error(`No point: ${String(response.status)}`);
  return (await response.json()) as AdminMeetingPoint;
}

const closed = { reasonIs: "Vegavinna við innkeyrsluna.", reasonEn: "Road works at the entrance." };

async function pause(id: string, until: string | null = null) {
  const { updatedAt } = await point(id);
  return send(`/admin/v1/meeting-points/${id}/pause`, { ...closed, until, updatedAt });
}

async function change(id: string, to: "resume" | "retire") {
  const { updatedAt } = await point(id);
  return send(`/admin/v1/meeting-points/${id}/${to}`, { updatedAt });
}

/** The point's audit entries, from the `from`th on: the log keeps those of earlier tests. */
async function auditEntriesFor(subjectId: string, from = 0) {
  const { rows } = await api.connection.pool.query<{
    action: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  }>("SELECT action, before, after FROM audit_log WHERE subject_id = $1 ORDER BY created_at, id", [
    subjectId,
  ]);
  return rows.slice(from);
}

const auditCount = async (subjectId: string) => (await auditEntriesFor(subjectId)).length;

/** Notifications of a paused point made so far, by kind and whom, oldest first. */
async function told() {
  return api.connection.db
    .select({
      kind: notifications.kind,
      recipientId: notifications.recipientId,
      bookingId: notifications.bookingId,
      tripId: notifications.tripId,
      meetingPointId: notifications.meetingPointId,
    })
    .from(notifications)
    .where(like(notifications.kind, "meeting_point_%"))
    .orderBy(asc(notifications.createdAt), asc(notifications.kind));
}

/** The tries of a paused point's news of a kind on a channel. */
async function triesOf(kind: string, channel: "push" | "sms") {
  return api.connection.db
    .select({ status: notificationDeliveries.status, reason: notificationDeliveries.reason })
    .from(notificationDeliveries)
    .innerJoin(notifications, eq(notifications.id, notificationDeliveries.notificationId))
    .where(and(eq(notifications.kind, kind), eq(notificationDeliveries.channel, channel)));
}

describe("pausing a meeting point (spec 2, 3.6.4)", () => {
  it("needs a console session", async () => {
    const noSession = "sr_operator=sr_os_not-a-session";
    const updatedAt = new Date().toISOString();
    for (const to of ["pause", "resume", "retire"]) {
      const { status } = await send(
        `/admin/v1/meeting-points/${fitjar}/${to}`,
        { ...closed, until: null, updatedAt },
        noSession,
      );
      expect(status, to).toBe(401);
    }
  });

  it("tells the driver of each future trip once, and each passenger who gets in or out there once", async () => {
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
    // paid yet; Bjarni only passes through, so his part does not change.
    const annas = await booked(anna.accessToken, airport, { fromStop: 0, toStop: 2 });
    await paid(anna.accessToken, annas.id);
    const gunnas = await booked(gunna.accessToken, airport, { fromStop: 2, toStop: 3 });
    const bjarnis = await booked(bjarni.accessToken, airport, { fromStop: 1, toStop: 3 });
    await paid(bjarni.accessToken, bjarnis.id);

    const mark = await auditCount(fitjar);
    const paused = await pause(fitjar, "2026-11-20");
    expect(paused.status).toBe(200);
    expect(paused.body).toMatchObject({
      status: "paused",
      pauseReason: { is: closed.reasonIs, en: closed.reasonEn },
      pausedUntil: "2026-11-20",
      futureTrips: 1,
    });
    // The trip itself is not changed or cancelled (plan, review focus 4).
    const [trip] = await api.connection.db
      .select({ status: schema.trips.status })
      .from(schema.trips)
      .where(eq(schema.trips.id, airport));
    expect(trip?.status).toBe("published");
    expect(await auditEntriesFor(fitjar, mark)).toEqual([
      {
        action: "meeting_point.paused",
        before: { status: "active", pauseReason: null, pausedUntil: null },
        after: {
          status: "paused",
          pauseReason: { is: closed.reasonIs, en: closed.reasonEn },
          pausedUntil: "2026-11-20",
          futureTrips: 1,
        },
      },
    ]);
    const events = await api.connection.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.kind, "MeetingPointChanged"));
    expect(events.map((event) => [event.kind, event.payload])).toEqual([
      ["MeetingPointChanged", { tripId: airport, meetingPointId: fitjar }],
    ]);

    const push = createFakePushSender();
    await worker({ push }).runOnce();
    await worker({ push }).runOnce();
    // The driver is asked to choose another stop, on the trip's page.
    expect(push.sent.filter((message) => message.title.startsWith("Meeting point"))).toEqual([
      {
        to: "ExponentPushToken[jon]",
        title: "Meeting point not in use for now: N1 Fitjar",
        body: expect.stringMatching(
          /^Road works at the entrance\.\nBack in use: 20 November 2026\nChoose another stop for your trip: Saturday 14 November at \d\d:\d\d\.$/,
        ) as unknown,
        data: { path: `/drive/trips/${airport}` },
      },
    ]);
    const made = await told();
    expect(made).toHaveLength(3);
    expect(made).toEqual(
      expect.arrayContaining([
        {
          kind: "meeting_point_changed_driver",
          recipientId: jon.userId,
          bookingId: null,
          tripId: airport,
          meetingPointId: fitjar,
        },
        {
          kind: "meeting_point_changed",
          recipientId: anna.userId,
          bookingId: annas.id,
          tripId: null,
          meetingPointId: fitjar,
        },
        {
          kind: "meeting_point_changed",
          recipientId: gunna.userId,
          bookingId: gunnas.id,
          tripId: null,
          meetingPointId: fitjar,
        },
      ]),
    );
    // Both board within 24 hours, so the passengers also get an SMS (spec 7, 3.4).
    expect(sms.outbox.map((message) => message.text)).toEqual([
      "ShareRide: the meeting point for your trip on Saturday 14 November has changed. Details in the app.",
      "ShareRide: the meeting point for your trip on Saturday 14 November has changed. Details in the app.",
    ]);
  });

  it("tells nobody when the point is back in use before the news goes out, and does not send news a failed try left", async () => {
    const anna = await newMember("Anna");
    const annas = await booked(anna.accessToken, airport, { fromStop: 0, toStop: 2 });
    await paid(anna.accessToken, annas.id);

    // Back in use before the worker runs: nobody is told.
    await pause(fitjar);
    expect((await change(fitjar, "resume")).status).toBe(200);
    await worker().runOnce();
    expect(await told()).toEqual([]);

    // Back in use after a failed SMS: the next try is dropped.
    await pause(fitjar);
    let tries = 0;
    const failing: SmsSender = {
      send: () => {
        tries += 1;
        return Promise.reject(new Error("The SMS provider is down."));
      },
    };
    await worker({ sms: failing }).runOnce();
    expect(tries).toBe(1);
    await change(fitjar, "resume");
    await later(60);
    await worker().runOnce();
    const deliveries = await api.connection.db
      .select({ status: notificationDeliveries.status, reason: notificationDeliveries.reason })
      .from(notificationDeliveries)
      .innerJoin(notifications, eq(notifications.id, notificationDeliveries.notificationId))
      .where(
        and(eq(notifications.recipientId, anna.userId), eq(notificationDeliveries.channel, "sms")),
      );
    expect(deliveries).toEqual([{ status: "skipped", reason: "no_longer_applies" }]);
    expect(sms.outbox).toEqual([]);
  });

  it("drops a driver's news a failed try left once the trip has passed the point", async () => {
    const jon = await driverOf(airport, "Jón");
    await api.client.call(setPushTokenRoute, {
      accessToken: jon.accessToken,
      body: { token: "ExponentPushToken[jon]" },
    });
    await pause(fitjar);
    const push = createFakePushSender();
    push.failure = new Error("The push service is down.");
    await worker({ push }).runOnce();
    expect(push.attempts).toBe(1);

    // Saturday at noon: the trip passed Fitjar in the morning.
    await later(hours(24));
    push.failure = null;
    await worker({ push }).runOnce();
    expect(push.sent).toEqual([]);
    expect(await triesOf("meeting_point_changed_driver", "push")).toEqual([
      { status: "skipped", reason: "no_longer_applies" },
    ]);
  });

  it("drops a passenger's news a failed try left once their booking no longer stops there", async () => {
    const anna = await newMember("Anna");
    const annas = await booked(anna.accessToken, airport, { fromStop: 0, toStop: 2 });
    await paid(anna.accessToken, annas.id);
    await pause(fitjar);
    const failing: SmsSender = {
      send: () => Promise.reject(new Error("The SMS provider is down.")),
    };
    await worker({ sms: failing }).runOnce();

    // Anna now gets out at Fjörður, the stop before.
    const [fjordur] = await api.connection.db
      .select({ id: schema.tripStops.id })
      .from(schema.tripStops)
      .where(and(eq(schema.tripStops.tripId, airport), eq(schema.tripStops.position, 1)));
    await api.connection.db
      .update(schema.bookings)
      .set({ toStopId: fjordur?.id })
      .where(eq(schema.bookings.id, annas.id));
    await later(60);
    await worker().runOnce();
    expect(sms.outbox).toEqual([]);
    expect(await triesOf("meeting_point_changed", "sms")).toEqual([
      { status: "skipped", reason: "no_longer_applies" },
    ]);
  });

  it("checks the reason in both languages and the end date, naming each problem", async () => {
    const { updatedAt } = await point(fitjar);
    const { status, body } = await send(`/admin/v1/meeting-points/${fitjar}/pause`, {
      reasonIs: " ",
      reasonEn: "Closed.",
      until: "2026-11-13",
      updatedAt,
    });
    expect(status).toBe(400);
    expect((body as ErrorResponse).error.details).toEqual([
      { path: "reasonIs", issue: "required" },
      { path: "until", issue: "not_after_today" },
    ]);
    expect((await point(fitjar)).status).toBe("active");
  });

  it("brings a point back into use by hand, or on its end date in Iceland", async () => {
    const mark = await auditCount(fitjar);
    await pause(fitjar);
    const resumed = await change(fitjar, "resume");
    expect(resumed.body).toMatchObject({ status: "active", pauseReason: null, pausedUntil: null });
    expect((await auditEntriesFor(fitjar, mark)).map((entry) => entry.action)).toEqual([
      "meeting_point.paused",
      "meeting_point.resumed",
    ]);

    await pause(kringlan, "2026-11-14");
    const loaded = await point(kringlan);
    expect(await moveMeetingPointsOn(api.connection.db, api.now())).toEqual({
      resumed: 0,
      retired: 0,
    });
    // Midnight in Iceland, Saturday 14 November.
    await later(hours(12));
    expect(await moveMeetingPointsOn(api.connection.db, api.now())).toEqual({
      resumed: 1,
      retired: 0,
    });
    await signInAgain();
    const back = await point(kringlan);
    expect(back).toMatchObject({ status: "active", pauseReason: null, pausedUntil: null });
    // A console copy from before is now out of date.
    expect(back.updatedAt > loaded.updatedAt).toBe(true);
  });
});

describe("retiring a meeting point (spec 2, 3.6.5)", () => {
  it("retires a point no trip will stop at at once", async () => {
    const mark = await auditCount(kringlan);
    const { body } = await change(kringlan, "retire");
    expect(body).toMatchObject({ status: "retired", futureTrips: 0, reviewDueOn: null });
    expect(await auditEntriesFor(kringlan, mark)).toEqual([
      {
        action: "meeting_point.retired",
        before: { status: "active" },
        after: { status: "retired", futureTrips: 0 },
      },
    ]);
  });

  it("keeps a point in use until its last future trip has passed it, then retires it", async () => {
    const { body } = await change(fitjar, "retire");
    expect(body).toMatchObject({ status: "retiring", futureTrips: 1 });
    expect(await moveMeetingPointsOn(api.connection.db, api.now())).toEqual({
      resumed: 0,
      retired: 0,
    });
    // Saturday at noon: the trip passed Fitjar in the morning.
    await later(hours(24));
    expect(await moveMeetingPointsOn(api.connection.db, api.now())).toEqual({
      resumed: 0,
      retired: 1,
    });
    await signInAgain();
    expect(await point(fitjar)).toMatchObject({ status: "retired", futureTrips: 0 });
  });

  it("keeps a point in use while a trip under way is still to stop there", async () => {
    await change(fitjar, "retire");
    // Jón set off, and Fitjar is still ahead.
    await api.connection.db
      .update(schema.trips)
      .set({ status: "departed" })
      .where(eq(schema.trips.id, airport));
    expect(await moveMeetingPointsOn(api.connection.db, api.now())).toEqual({
      resumed: 0,
      retired: 0,
    });
    expect((await point(fitjar)).status).toBe("retiring");
  });

  it("retires a paused point at once, and its trips still hear of it", async () => {
    const anna = await newMember("Anna");
    const annas = await booked(anna.accessToken, airport, { fromStop: 0, toStop: 2 });
    await paid(anna.accessToken, annas.id);
    const jon = await driverOf(airport, "Jón");
    await api.client.call(setPushTokenRoute, {
      accessToken: jon.accessToken,
      body: { token: "ExponentPushToken[jon]" },
    });
    await pause(fitjar, "2026-11-20");
    const { body } = await change(fitjar, "retire");
    // The reason stays: the trips that stop there still need another stop.
    expect(body).toMatchObject({
      status: "retired",
      futureTrips: 1,
      pauseReason: { is: closed.reasonIs, en: closed.reasonEn },
      pausedUntil: null,
    });

    // Retired before the news went out: the driver and Anna still hear of it.
    const push = createFakePushSender();
    await worker({ push }).runOnce();
    expect(push.sent.filter((message) => message.title.startsWith("Meeting point"))).toEqual([
      {
        to: "ExponentPushToken[jon]",
        title: "Meeting point no longer in use: N1 Fitjar",
        body: expect.stringMatching(
          /^Road works at the entrance\.\nChoose another stop for your trip: Saturday 14 November at \d\d:\d\d\.$/,
        ) as unknown,
        data: { path: `/drive/trips/${airport}` },
      },
    ]);
    expect((await told()).map((made) => made.recipientId).sort()).toEqual(
      [anna.userId, jon.userId].sort(),
    );
    expect(sms.outbox).toHaveLength(1);
  });
});

describe("status changes", () => {
  it("refuse a change the status does not allow, an older copy and an unknown point", async () => {
    await change(kringlan, "retire");
    for (const to of ["resume", "retire"] as const) {
      const refused = await change(kringlan, to);
      expect(refused.status, to).toBe(409);
      expect((refused.body as ErrorResponse).error.code).toBe("status_change_not_allowed");
    }
    expect((await change(fitjar, "resume")).status).toBe(409);

    const loaded = await point(fitjar);
    await pause(fitjar);
    const stale = await send(`/admin/v1/meeting-points/${fitjar}/resume`, {
      updatedAt: loaded.updatedAt,
    });
    expect(stale.status).toBe(409);
    expect((stale.body as ErrorResponse).error.code).toBe("meeting_point_changed");

    const unknown = await send(`/admin/v1/meeting-points/${sampleId("point:nowhere")}/retire`, {
      updatedAt: loaded.updatedAt,
    });
    expect(unknown.status).toBe(404);
  });

  it("are saved with their audit entry and events, or not at all", async () => {
    const { pool } = api.connection;
    await pool.query(`
      CREATE FUNCTION test_refuse_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'test: audit entry refused';
      END $$;
      CREATE TRIGGER test_refuse_audit BEFORE INSERT ON audit_log
        FOR EACH ROW EXECUTE FUNCTION test_refuse_audit();
    `);
    try {
      expect((await pause(fitjar)).status).toBe(500);
    } finally {
      await pool.query(`
        DROP TRIGGER test_refuse_audit ON audit_log;
        DROP FUNCTION test_refuse_audit();
      `);
    }
    expect((await point(fitjar)).status).toBe("active");
    expect(await api.connection.db.$count(outboxEvents)).toBe(0);
  });

  it("set the yearly review a year after the last check of a point in use (R2.9)", async () => {
    const loaded = await point(fitjar);
    const response = await api.request(`/admin/v1/meeting-points/${fitjar}`, {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        nameIs: loaded.nameIs,
        nameEn: loaded.nameEn,
        aliases: loaded.aliases,
        position: loaded.position,
        region: loaded.region,
        municipality: loaded.municipality,
        type: loaded.type,
        amenities: loaded.amenities,
        whereToStandIs: loaded.whereToStandIs,
        whereToStandEn: loaded.whereToStandEn,
        shelterHours: loaded.shelterHours,
        shelterNoteIs: loaded.shelterNoteIs,
        shelterNoteEn: loaded.shelterNoteEn,
        season: loaded.season,
        lastCheckedOn: "2026-11-12",
        amenitiesReviewed: false,
        seasonReviewed: false,
        updatedAt: loaded.updatedAt,
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      lastCheckedOn: "2026-11-12",
      reviewDueOn: "2027-11-12",
    });
    const { body } = await change(fitjar, "retire");
    expect(body).toMatchObject({ status: "retiring", reviewDueOn: "2027-11-12" });
  });
});
