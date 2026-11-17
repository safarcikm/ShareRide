import { randomUUID } from "node:crypto";
import {
  acceptRequestRoute,
  bookingRoute,
  bookTripRoute,
  changeTripRoute,
  conversationMessagesRoute,
  declineRequestRoute,
  getMeRoute,
  messageAllPassengersRoute,
  myBookingsRoute,
  myTripsRoute,
  publishTripRoute,
  sendMessageRoute,
  soonestTripsRoute,
  tripDetailsRoute,
  tripSearchAlternativesRoute,
  tripSearchRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { sampleId } from "@shareride/db/seed";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createFakePushSender } from "../../platform/push.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import type { AuditRequest } from "../admin/audit.ts";
import { cancelBookingAsOperator, cancelTripAsOperator } from "../bookings/cancel-trip.ts";
import type { Transaction } from "../bookings/seats.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  hours,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";
import { createNotificationWorker } from "../notifications/worker.ts";
import { collectExport } from "../privacy/export-data.ts";
import { createModerationService, endDueSuspensions, type Moderator } from "./actions.ts";

// The sample trips at the test clock (Friday 13 November 2026, noon): Jón
// drives Hlemmur to Keflavík Airport on Saturday at 05:30 (instant
// booking), and Anna drives BSÍ to Hof, Akureyri on Saturday at 09:00
// (approval). The operator's actions come from the console in later PRs;
// here they are called as the console will call them.

let api: TestApi;
const { airport, north } = sampleTrip;
const point = (key: string) => sampleId(`point:${key}`);
const request: AuditRequest = { ipAddress: "203.0.113.9", userAgent: "Console test" };
const reason = "Repeated messages after being asked to stop.";

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  await freshSampleTrips(api);
  const { db } = api.connection;
  await db.execute(sql`delete from outbox_events`);
  await db.execute(sql`delete from notifications`);
  await db.execute(sql`delete from push_tokens`);
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, rewind, later, driverOf, booked, paid, occupancy } = bookingHelpers(() => api);

const moderation = () => createModerationService({ db: api.connection.db, clock: () => api.now() });

async function moderator(): Promise<Moderator> {
  const { userId, sessionId } = await api.signInOperator();
  return { userId, sessionId };
}

const days = (count: number) => new Date(api.now().getTime() + count * 24 * 3_600_000);

async function stored(bookingId: string) {
  const [row] = await api.connection.db
    .select()
    .from(schema.bookings)
    .where(eq(schema.bookings.id, bookingId));
  return row;
}

async function standing(userId: string) {
  const [row] = await api.connection.db
    .select({ status: schema.users.status, suspendedUntil: schema.users.suspendedUntil })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return row;
}

async function auditOf(userId: string) {
  return api.connection.db
    .select({
      operatorUserId: schema.auditLog.operatorUserId,
      operatorSessionId: schema.auditLog.operatorSessionId,
      action: schema.auditLog.action,
      subjectType: schema.auditLog.subjectType,
      before: schema.auditLog.before,
      after: schema.auditLog.after,
      ipAddress: schema.auditLog.ipAddress,
    })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.subjectId, userId))
    .orderBy(asc(schema.auditLog.createdAt), asc(schema.auditLog.id));
}

async function events(...types: string[]) {
  return api.connection.db
    .select({ kind: schema.outboxEvents.kind, payload: schema.outboxEvents.payload })
    .from(schema.outboxEvents)
    .where(inArray(schema.outboxEvents.kind, types))
    .orderBy(asc(schema.outboxEvents.id));
}

/** Gives each member the app on their phone, so push reaches them. */
async function withPush(...members: Member[]) {
  const { db } = api.connection;
  for (const member of members) {
    const [session] = await db
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, member.userId));
    if (session === undefined) throw new Error("No session.");
    await db.insert(schema.pushTokens).values({
      sessionId: session.id,
      userId: member.userId,
      platform: "ios",
      token: `ExponentPushToken[${member.userId}]`,
    });
  }
}

describe("suspending someone (spec 9, 3.6; R9.10)", () => {
  it("cancels their upcoming trips and bookings with full refunds, and tells the others only that ShareRide cancelled", async () => {
    const jon = await driverOf(airport, "Jón");
    const anna = await driverOf(north, "Anna");
    const gunna = await newMember("Gunna");
    const ride = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
    await paid(gunna.accessToken, ride.id);
    const asked = await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    expect(asked.status).toBe("requested");
    // Only what the suspension sends, not the booking's own news.
    await api.connection.db.execute(sql`delete from outbox_events`);
    await withPush(jon, anna, gunna);
    const by = await moderator();
    const until = days(30);

    const result = await moderation().suspend(
      by,
      { userId: jon.userId, rule: "harassment", reason: `  ${reason} `, until },
      request,
    );
    expect(result).toEqual({
      ok: true,
      value: { actionId: expect.any(String) as unknown, tripsCancelled: 1, bookingsCancelled: 1 },
    });
    if (!result.ok) return;
    expect(await standing(jon.userId)).toEqual({ status: "suspended", suspendedUntil: until });
    const [action] = await api.connection.db
      .select()
      .from(schema.moderationActions)
      .where(eq(schema.moderationActions.id, result.value.actionId));
    expect(action).toMatchObject({
      userId: jon.userId,
      kind: "suspension",
      rule: "harassment",
      reason,
      until,
      operatorId: by.userId,
      reportId: null,
    });

    // Jón's trip: cancelled by ShareRide, without a reason, not on his reliability.
    const [trip] = await api.connection.db
      .select()
      .from(schema.trips)
      .where(eq(schema.trips.id, airport));
    expect(trip).toMatchObject({
      status: "cancelled",
      cancelledBy: "operator",
      cancelReason: null,
      cancelNote: "",
      countsOnReliability: false,
    });
    // Gunna gets back all she paid, and reads only that ShareRide cancelled.
    expect(await stored(ride.id)).toMatchObject({
      status: "cancelled",
      cancelledBy: "operator",
      refundAmount: ride.total.amount,
    });
    const payments = await api.connection.db
      .select({ status: schema.payments.status })
      .from(schema.payments)
      .where(eq(schema.payments.bookingId, ride.id));
    expect(payments).toEqual([{ status: "refund_due" }]);
    expect(
      await api.client.call(bookingRoute, {
        accessToken: gunna.accessToken,
        params: { id: ride.id },
      }),
    ).toMatchObject({
      data: {
        status: "cancelled",
        cancellation: {
          by: "operator",
          reason: null,
          note: "",
          wholeTrip: true,
          refund: ride.total,
          countsOnReliability: null,
        },
      },
    });
    const chat = await api.client.call(conversationMessagesRoute, {
      accessToken: gunna.accessToken,
      params: { id: ride.id },
      query: {},
    });
    if (!chat.ok) throw new Error(chat.error.code);
    expect(chat.data.messages.map((message) => message.system)).toContainEqual({
      key: "cancelled_by_shareride",
      wholeTrip: true,
    });
    // Jón's request on Anna's trip: cancelled by ShareRide, its seat free again.
    expect(await stored(asked.id)).toMatchObject({
      status: "cancelled",
      cancelledBy: "operator",
      cancelReason: null,
      refundAmount: 0,
    });
    expect(await occupancy(north)).toEqual([0, 0, 0]);
    expect(
      await api.client.call(bookingRoute, {
        accessToken: anna.accessToken,
        params: { id: asked.id },
      }),
    ).toMatchObject({ data: { cancellation: { by: "operator", reason: null, wholeTrip: false } } });

    // One audit entry: IDs and the names of the fields changed, never their
    // values (spec 9, section 7).
    const audit = await auditOf(jon.userId);
    expect(audit).toEqual([
      {
        operatorUserId: by.userId,
        operatorSessionId: by.sessionId,
        action: "user.suspended",
        subjectType: "user",
        before: null,
        after: {
          fields: ["status", "suspendedUntil"],
          moderationActionId: result.value.actionId,
          cancelledTrips: [airport],
          cancelledBookings: [asked.id],
        },
        ipAddress: request.ipAddress,
      },
    ]);

    // Each is told: Jón why, the others only that it was cancelled.
    expect(await events("ModerationActionTaken", "TripCancelled", "BookingCancelled")).toEqual([
      { kind: "TripCancelled", payload: { tripId: airport, bookingId: ride.id } },
      { kind: "BookingCancelled", payload: { bookingId: asked.id, by: "operator" } },
      { kind: "ModerationActionTaken", payload: { actionId: result.value.actionId } },
    ]);
    const push = createFakePushSender();
    await createNotificationWorker({
      db: api.connection.db,
      clock: () => api.now(),
      push,
    }).runOnce();
    const to = (member: Member) =>
      push.sent
        .filter((message) => message.to === `ExponentPushToken[${member.userId}]`)
        .map(({ title, body }) => ({ title, body }));
    expect(to(jon)).toEqual([
      {
        title: expect.stringMatching(/^Your account is suspended until /) as unknown,
        body: "Read why in ShareRide.",
      },
    ]);
    expect(to(gunna)).toEqual([
      {
        title: "ShareRide cancelled the trip",
        body: expect.stringContaining("Full refund") as unknown,
      },
    ]);
    expect(to(anna)).toEqual([
      { title: "Cancelled by ShareRide: Jón", body: expect.any(String) as unknown },
    ]);
    expect(JSON.stringify(push.sent)).not.toContain("Repeated");
  });

  it("lets a trip under way carry on, and is safe to ask twice", async () => {
    const jon = await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const ride = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
    await paid(gunna.accessToken, ride.id);
    await api.connection.db
      .update(schema.trips)
      .set({ status: "departed" })
      .where(eq(schema.trips.id, airport));
    const by = await moderator();
    const input = { userId: jon.userId, rule: "safety", reason, until: null } as const;

    const [first, second] = await Promise.all([
      moderation().suspend(by, input, request),
      moderation().suspend(by, input, request),
    ]);
    expect([first, second]).toContainEqual({
      ok: true,
      value: { actionId: expect.any(String) as unknown, tripsCancelled: 0, bookingsCancelled: 0 },
    });
    expect([first, second]).toContainEqual({ ok: false, error: { code: "already_suspended" } });
    expect(await standing(jon.userId)).toEqual({ status: "suspended", suspendedUntil: null });
    expect(await stored(ride.id)).toMatchObject({ status: "confirmed" });
    expect(await auditOf(jon.userId)).toHaveLength(1);
  });

  it("finishes two suspensions at once whose trips cross, without a deadlock", async () => {
    const jon = await driverOf(airport, "Jón");
    const anna = await driverOf(north, "Anna");
    // Each rides on the other's trip, so each suspension locks both trips.
    await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    const annas = await booked(anna.accessToken, airport, { fromStop: 0, toStop: 1 });
    await paid(anna.accessToken, annas.id);
    const by = await moderator();
    const suspend = (member: Member) =>
      moderation().suspend(
        by,
        { userId: member.userId, rule: "safety", reason, until: null },
        request,
      );

    const results = await Promise.all([suspend(jon), suspend(anna)]);
    expect(results.map((result) => result.ok)).toEqual([true, true]);
    const rows = await api.connection.db
      .select({ status: schema.trips.status })
      .from(schema.trips)
      .where(inArray(schema.trips.id, [airport, north]));
    expect(rows).toEqual([{ status: "cancelled" }, { status: "cancelled" }]);
    expect(await occupancy(north)).toEqual([0, 0, 0]);
  });

  it("closes a suspended driver's trip under way to anyone new", async () => {
    const jon = await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const siggi = await newMember("Siggi");
    const { db } = api.connection;
    // Under way, with a request waiting for a later stop.
    await db
      .update(schema.trips)
      .set({ status: "departed", bookingMode: "approval" })
      .where(eq(schema.trips.id, airport));
    const asked = await booked(gunna.accessToken, airport, { fromStop: 2, toStop: 3 });
    await moderation().suspend(
      await moderator(),
      { userId: jon.userId, rule: "safety", reason, until: null },
      request,
    );

    // Nobody finds it or books it, and Jón cannot take a passenger on.
    const search = await api.client.call(tripSearchRoute, {
      accessToken: siggi.accessToken,
      query: { from: point("fitjar"), to: point("kef") },
    });
    if (!search.ok) throw new Error(search.error.code);
    expect(search.data.results.map((result) => result.tripId)).not.toContain(airport);
    const details = await api.client.call(tripDetailsRoute, {
      params: { id: airport },
      query: { fromStop: 1, toStop: 3, seats: 1 },
    });
    if (!details.ok) throw new Error(details.error.code);
    expect(
      await api.client.call(bookTripRoute, {
        accessToken: siggi.accessToken,
        params: { id: airport },
        body: {
          fromStop: 1,
          toStop: 3,
          seats: 1,
          total: details.data.part.total,
          message: "",
          attemptKey: randomUUID(),
        },
      }),
    ).toMatchObject({ status: 409, error: { code: "trip_not_bookable" } });
    expect(
      await api.client.call(acceptRequestRoute, {
        accessToken: jon.accessToken,
        params: { id: asked.id },
        body: {},
      }),
    ).toMatchObject({ status: 403, error: { code: "account_suspended" } });
    // Saying no stays open, so Gunna can look for another ride at once.
    expect(
      await api.client.call(declineRequestRoute, {
        accessToken: jon.accessToken,
        params: { id: asked.id },
        body: {},
      }),
    ).toMatchObject({ status: 200, data: { status: "declined" } });
  });

  it("refuses without a reason, with an end that has passed, or for nobody", async () => {
    const jon = await newMember("Jón");
    const by = await moderator();
    const service = moderation();
    expect(
      await service.suspend(
        by,
        { userId: jon.userId, rule: "safety", reason: " ", until: null },
        request,
      ),
    ).toEqual({ ok: false, error: { code: "reason_missing" } });
    expect(
      await service.suspend(
        by,
        { userId: jon.userId, rule: "safety", reason, until: days(-1) },
        request,
      ),
    ).toEqual({ ok: false, error: { code: "until_past" } });
    expect(
      await service.suspend(
        by,
        { userId: randomUUID(), rule: "safety", reason, until: null },
        request,
      ),
    ).toEqual({ ok: false, error: { code: "not_found" } });
    expect(
      await service.suspend(
        by,
        { userId: jon.userId, rule: "safety", reason, until: null, reportId: randomUUID() },
        request,
      ),
    ).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await standing(jon.userId)).toEqual({ status: "active", suspendedUntil: null });
    expect(await auditOf(jon.userId)).toEqual([]);
  });
});

describe("what a suspended person can still do (spec 9, 3.6.2)", () => {
  async function suspendedDriverWithPassenger() {
    const jon = await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    const ride = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
    await paid(gunna.accessToken, ride.id);
    // Straight in the database, so his trip and bookings stay to try with.
    await api.connection.db
      .update(schema.users)
      .set({ status: "suspended", suspendedUntil: days(30) })
      .where(eq(schema.users.id, jon.userId));
    return { jon, gunna, ride };
  }

  const suspended = { status: 403, error: { code: "account_suspended" } };

  it("refuses searching, booking, publishing, changing a trip and sending messages, saying until when", async () => {
    const { jon, ride } = await suspendedDriverWithPassenger();
    const accessToken = jon.accessToken;
    const until = (await standing(jon.userId))?.suspendedUntil?.toISOString();

    expect(
      await api.client.call(tripSearchRoute, {
        accessToken,
        query: { from: point("borgarnes"), to: point("blonduos") },
      }),
    ).toMatchObject({ status: 403, error: { code: "account_suspended", suspendedUntil: until } });
    expect(
      await api.client.call(tripSearchAlternativesRoute, {
        accessToken,
        query: { from: point("borgarnes"), to: point("blonduos") },
      }),
    ).toMatchObject(suspended);
    expect(await api.client.call(soonestTripsRoute, { accessToken, query: {} })).toMatchObject(
      suspended,
    );
    const details = await api.client.call(tripDetailsRoute, {
      params: { id: north },
      query: { fromStop: 0, toStop: 1, seats: 1 },
    });
    if (!details.ok) throw new Error(details.error.code);
    expect(
      await api.client.call(bookTripRoute, {
        accessToken,
        params: { id: north },
        body: {
          fromStop: 0,
          toStop: 1,
          seats: 1,
          total: details.data.part.total,
          message: "",
          attemptKey: randomUUID(),
        },
      }),
    ).toMatchObject(suspended);
    expect(
      await api.client.call(publishTripRoute, {
        accessToken,
        params: { id: randomUUID() },
        body: {},
      }),
    ).toMatchObject(suspended);
    expect(
      await api.client.call(changeTripRoute, {
        accessToken,
        params: { id: airport },
        query: { preview: true },
        body: { kind: "seats", seats: 3 },
      }),
    ).toMatchObject(suspended);
    expect(
      await api.client.call(sendMessageRoute, {
        accessToken,
        params: { id: ride.id },
        body: { clientId: randomUUID(), text: "Halló" },
      }),
    ).toMatchObject(suspended);
    expect(
      await api.client.call(messageAllPassengersRoute, {
        accessToken,
        params: { id: airport },
        body: { clientId: randomUUID(), text: "Halló" },
      }),
    ).toMatchObject(suspended);
  });

  it("keeps reading their account, trips, bookings and chats, and others keep searching", async () => {
    const { jon, gunna, ride } = await suspendedDriverWithPassenger();
    const accessToken = jon.accessToken;
    // The app shows the suspended account screen from this (spec 9, 3.6.2).
    expect(await api.client.call(getMeRoute, { accessToken })).toMatchObject({
      status: 200,
      data: { suspension: { until: days(30).toISOString() } },
    });
    expect(await api.client.call(getMeRoute, { accessToken: gunna.accessToken })).toMatchObject({
      status: 200,
      data: { suspension: null },
    });
    expect(
      await api.client.call(myTripsRoute, { accessToken, query: { when: "upcoming" } }),
    ).toMatchObject({
      status: 200,
    });
    expect(
      await api.client.call(myBookingsRoute, { accessToken, query: { when: "upcoming" } }),
    ).toMatchObject({
      status: 200,
    });
    expect(
      await api.client.call(conversationMessagesRoute, {
        accessToken,
        params: { id: ride.id },
        query: {},
      }),
    ).toMatchObject({ status: 200 });
    expect(
      await api.client.call(tripDetailsRoute, {
        accessToken,
        params: { id: north },
        query: {},
      }),
    ).toMatchObject({ status: 200 });
    expect(
      await api.client.call(tripSearchRoute, {
        accessToken: gunna.accessToken,
        query: { from: point("borgarnes"), to: point("blonduos") },
      }),
    ).toMatchObject({ status: 200 });
  });

  it("is refused nothing once the end has passed, before the minute job stores it", async () => {
    const { jon } = await suspendedDriverWithPassenger();
    await later(hours(24 * 30) + 60, jon);
    expect(await api.client.call(getMeRoute, { accessToken: jon.accessToken })).toMatchObject({
      data: { suspension: null },
    });
    expect(
      await api.client.call(tripSearchRoute, {
        accessToken: jon.accessToken,
        query: { from: point("borgarnes"), to: point("blonduos") },
      }),
    ).toMatchObject({ status: 200 });
  });
});

describe("ending a suspension (spec 9, 3.6.3)", () => {
  it("ends by itself once its end passes, and tells the person once", async () => {
    const jon = await newMember("Jón");
    const forGood = await newMember("Siggi");
    const by = await moderator();
    const service = moderation();
    const end = days(7);
    await service.suspend(
      by,
      { userId: jon.userId, rule: "reliability", reason, until: end },
      request,
    );
    await service.suspend(
      by,
      { userId: forGood.userId, rule: "safety", reason, until: null },
      request,
    );
    await api.connection.db.execute(sql`delete from outbox_events`);

    // Suspended until the end, and not a moment after (isSuspended).
    expect(await endDueSuspensions(api.connection.db, new Date(end.getTime() - 1))).toBe(0);
    expect(await endDueSuspensions(api.connection.db, end)).toBe(1);
    expect(await endDueSuspensions(api.connection.db, days(8))).toBe(0);
    expect(await standing(jon.userId)).toEqual({ status: "active", suspendedUntil: null });
    expect(await standing(forGood.userId)).toEqual({ status: "suspended", suspendedUntil: null });
    expect(await events("SuspensionEnded")).toEqual([
      { kind: "SuspensionEnded", payload: { userId: jon.userId } },
    ]);
  });

  it("reinstates early with a note the person reads, and only someone suspended", async () => {
    const jon = await newMember("Jón");
    const by = await moderator();
    const service = moderation();
    expect(await service.reinstate(by, { userId: jon.userId, note: "A mix-up." }, request)).toEqual(
      { ok: false, error: { code: "not_suspended" } },
    );
    await service.suspend(by, { userId: jon.userId, rule: "safety", reason, until: null }, request);
    expect(await service.reinstate(by, { userId: jon.userId, note: "  " }, request)).toEqual({
      ok: false,
      error: { code: "reason_missing" },
    });

    const result = await service.reinstate(
      by,
      { userId: jon.userId, note: " Shown to be a mix-up. " },
      request,
    );
    expect(result).toEqual({ ok: true, value: { actionId: expect.any(String) as unknown } });
    if (!result.ok) return;
    expect(await standing(jon.userId)).toEqual({ status: "active", suspendedUntil: null });
    const [action] = await api.connection.db
      .select()
      .from(schema.moderationActions)
      .where(eq(schema.moderationActions.id, result.value.actionId));
    expect(action).toMatchObject({
      kind: "reinstatement",
      rule: null,
      reason: "Shown to be a mix-up.",
      until: null,
    });
    expect(
      (await auditOf(jon.userId)).map(({ action: name, before, after }) => ({
        name,
        before,
        after,
      })),
    ).toEqual([
      expect.objectContaining({ name: "user.suspended" }),
      {
        name: "user.reinstated",
        before: null,
        after: { fields: ["status", "suspendedUntil"], moderationActionId: result.value.actionId },
      },
    ]);
    expect(
      (await events("ModerationActionTaken")).map(({ payload }) => payload["actionId"]),
    ).toContain(result.value.actionId);
  });
});

describe("warning someone (spec 9, 3.4.3)", () => {
  it("stores the warning with its rule and reason, audits it and tells the person", async () => {
    const jon = await newMember("Jón");
    const by = await moderator();
    const result = await moderation().warn(
      by,
      { userId: jon.userId, rule: "offensive", reason: "Rude words in a trip note." },
      request,
    );
    expect(result).toEqual({ ok: true, value: { actionId: expect.any(String) as unknown } });
    if (!result.ok) return;
    expect(await standing(jon.userId)).toEqual({ status: "active", suspendedUntil: null });
    const audit = await auditOf(jon.userId);
    expect(audit).toMatchObject([
      {
        action: "user.warned",
        before: null,
        after: { moderationActionId: result.value.actionId },
      },
    ]);
    expect(await events("ModerationActionTaken")).toEqual([
      { kind: "ModerationActionTaken", payload: { actionId: result.value.actionId } },
    ]);
    expect(
      await moderation().warn(by, { userId: jon.userId, rule: "offensive", reason: "" }, request),
    ).toEqual({ ok: false, error: { code: "reason_missing" } });
  });
});

describe("ShareRide's cancellations (spec 9, 3.4.3 and 3.6)", () => {
  const inTransaction = <T>(run: (tx: Transaction) => Promise<T>) =>
    api.connection.db.transaction(run);

  it("cancels a trip once, and says when it was cancelled already", async () => {
    const clock = () => api.now();
    expect(await inTransaction((tx) => cancelTripAsOperator(tx, airport, false, clock))).toEqual({
      ok: true,
      value: true,
    });
    expect(await inTransaction((tx) => cancelTripAsOperator(tx, airport, false, clock))).toEqual({
      ok: true,
      value: false,
    });
  });

  it("leaves a booking whose passenger has boarded by the time the trip is locked", async () => {
    const gunna = await newMember("Gunna");
    const ride = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
    await paid(gunna.accessToken, ride.id);
    const { db } = api.connection;
    await db.update(schema.trips).set({ status: "departed" }).where(eq(schema.trips.id, airport));
    await db
      .update(schema.tripStops)
      .set({ plannedAt: new Date(api.now().getTime() - 60_000) })
      .where(and(eq(schema.tripStops.tripId, airport), eq(schema.tripStops.position, 0)));
    expect(await inTransaction((tx) => cancelBookingAsOperator(tx, ride.id, () => api.now()))).toBe(
      false,
    );
    expect(await stored(ride.id)).toMatchObject({ status: "confirmed" });
  });
});

describe("Download my data, after ShareRide acted (spec 11; spec 9, R9.5)", () => {
  it("has the suspension's end, who cancelled a trip, and the notices", async () => {
    const jon = await driverOf(airport, "Jón");
    const until = days(30);
    await moderation().suspend(
      await moderator(),
      { userId: jon.userId, rule: "harassment", reason, until },
      request,
    );
    const data = await collectExport(api.connection.db, jon.userId, api.now());
    expect(data.sections.account).toMatchObject({
      status: "suspended",
      suspendedUntil: until.toISOString(),
    });
    expect(data.sections.trips_posted).toEqual(
      expect.arrayContaining([expect.objectContaining({ cancelledBy: "operator" })]),
    );
    expect(data.sections.notices).toEqual([
      {
        kind: "suspension",
        rule: "harassment",
        reason,
        content: null,
        until: until.toISOString(),
        createdAt: expect.any(String) as unknown,
        appeal: null,
        appealedAt: null,
        answer: null,
        appealOutcome: null,
        answeredAt: null,
      },
    ]);
  });
});
