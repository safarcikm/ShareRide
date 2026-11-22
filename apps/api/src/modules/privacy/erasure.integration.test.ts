import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import {
  acceptRequestRoute,
  bookingRoute,
  bookTripRoute,
  cancelTripRoute,
  conversationMessagesRoute,
  createTripRoute,
  deletionCheckRoute,
  driverCheckInRoute,
  messageAllPassengersRoute,
  myConversationsRoute,
  passengerCheckInRoute,
  sendMessageRoute,
  tripDetailsRoute,
} from "@shareride/contracts";
import { personalData, schema } from "@shareride/db";
import { sampleId } from "@shareride/db/seed";
import {
  blockedNumberUntil,
  defaultSafetySettings,
  defaultTripDaySettings,
  reportsClosedBy,
} from "@shareride/domain";
import { and, asc, eq, getTableColumns, getTableName, inArray, is, ne, sql } from "drizzle-orm";
import { PgTable, type PgColumn } from "drizzle-orm/pg-core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLogger } from "../../logger.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import { recordAudit } from "../admin/audit.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  hours,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";
import { readConversationAsOperator } from "../chat/operator.ts";
import { runPrivacyCommand, type ReadBeforeRestore } from "./command.ts";
import { createErasure } from "./erasure.ts";
import { collectExport } from "./export-data.ts";

// Erasure after the 7 days (spec 11, 3.5; plan 4.6). The sample trips at the
// test clock (Friday 13 November 2026, noon): Anna drives BSÍ to Akureyri on
// Saturday at 09:00 by approval; Jón drives Selfoss to Vík on Sunday at
// 10:00, instant, with nobody booked.

let api: TestApi;
let logLines: string[];

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  await freshSampleTrips(api);
  // Members of earlier tests wait no longer.
  await api.connection.db.update(schema.users).set({ deleteAfter: null });
  await api.connection.db.delete(schema.blockedNumbers);
  await api.connection.db.delete(schema.erasedAccounts);
  logLines = [];
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, later, rewind, driverOf, booked, paid, details } = bookingHelpers(() => api);
const { formerMemberId } = schema;

function erasure() {
  return createErasure({
    db: api.connection.db,
    clock: () => api.now(),
    hasher: api.features.hasher,
    tripDaySettings: defaultTripDaySettings,
    logger: createLogger({
      level: "info",
      destination: new Writable({
        write(chunk: Buffer, _encoding, callback) {
          logLines.push(chunk.toString());
          callback();
        },
      }),
    }),
  });
}

/** Ends the member's wait: as if they asked to delete their account over 7 days ago. */
async function waitEnded(member: Member, status: "active" | "suspended" = "active") {
  await api.connection.db
    .update(schema.users)
    .set({ deleteAfter: new Date(api.now().getTime() - 1000), status })
    .where(eq(schema.users.id, member.userId));
}

async function phoneOf(member: Member): Promise<string> {
  const [user] = await api.connection.db
    .select({ phone: schema.users.phoneE164 })
    .from(schema.users)
    .where(eq(schema.users.id, member.userId));
  if (user === undefined || user.phone === null) throw new Error("The member has no number.");
  return user.phone;
}

async function userExists(userId: string) {
  const rows = await api.connection.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return rows.length > 0;
}

const tables = new Map(
  (Object.values(schema) as unknown[])
    .filter((value): value is PgTable => is(value, PgTable))
    .map((table) => [getTableName(table), table]),
);

/** Rows in every table of the catalogue that still name `userId`, apart from those left as they are. */
async function rowsNaming(userId: string) {
  const left: string[] = [];
  for (const [name, entry] of Object.entries(personalData)) {
    if (entry.onDeletion?.rows === "leave") continue;
    const table = tables.get(name);
    if (table === undefined) throw new Error(`No table ${name}.`);
    const columns = getTableColumns(table) as Record<string, PgColumn>;
    for (const person of entry.personColumns) {
      const column = columns[person];
      if (column === undefined) throw new Error(`No column ${name}.${person}.`);
      const [row] = await api.connection.db
        .select({ count: sql<number>`count(*)::int` })
        .from(table)
        .where(eq(column, userId));
      if ((row?.count ?? 0) > 0) left.push(`${name}.${person}`);
    }
  }
  return left;
}

async function canWriteTo(accessToken: string, bookingId: string) {
  const list = await api.client.call(myConversationsRoute, { accessToken });
  if (!list.ok) throw new Error(list.error.code);
  const found = list.data.conversations.find(
    (conversation) => conversation.booking.id === bookingId,
  );
  if (found === undefined) throw new Error("No such conversation.");
  return found.canWrite;
}

/** A confirmed booking for the member on Anna's trip, BSÍ to Akureyri. */
async function confirmedOnNorth(anna: Member, member: Member) {
  const request = await booked(member.accessToken, sampleTrip.north, { fromStop: 0, toStop: 3 });
  const accepted = await api.client.call(acceptRequestRoute, {
    accessToken: anna.accessToken,
    params: { id: request.id },
    body: {},
  });
  if (!accepted.ok) throw new Error(accepted.error.code);
  if (accepted.data.status === "accepted") await paid(member.accessToken, request.id);
  return request.id;
}

/**
 * Anna with everything a driver has: a trip done with Gunna, a car, a draft,
 * a trip to come. With `siggi`, Siggi rode too, and Anna wrote to him.
 */
async function busyDriver({ siggi: withSiggi = false } = {}) {
  const anna = await driverOf(sampleTrip.north, "Anna");
  const gunna = await newMember("Gunna");
  const bookingId = await confirmedOnNorth(anna, gunna);
  const siggi = withSiggi ? await newMember("Siggi") : null;
  const siggisBookingId = siggi === null ? null : await confirmedOnNorth(anna, siggi);
  const { db } = api.connection;
  await db
    .update(schema.trips)
    .set({ note: "Call me from the bus stop" })
    .where(eq(schema.trips.id, sampleTrip.north));
  // Jón's trip to Vík is Anna's too: published, nobody booked.
  await db
    .update(schema.trips)
    .set({ driverId: anna.userId })
    .where(eq(schema.trips.id, sampleTrip.vik));
  const [north] = await db
    .select({ vehicleId: schema.trips.vehicleId })
    .from(schema.trips)
    .where(eq(schema.trips.id, sampleTrip.north));
  if (north?.vehicleId === null || north === undefined) throw new Error("No car.");
  await db
    .update(schema.vehicles)
    .set({ ownerId: anna.userId, registration: "AB123" })
    .where(eq(schema.vehicles.id, north.vehicleId));
  const [spare] = await db
    .insert(schema.vehicles)
    .values({
      ownerId: anna.userId,
      make: "Kia",
      model: "Ceed",
      colour: "red",
      registration: "XY987",
    })
    .returning({ id: schema.vehicles.id });
  if (spare === undefined) throw new Error("No spare car.");
  const draft = await api.client.call(createTripRoute, {
    accessToken: anna.accessToken,
    body: { stops: ["bsi", "borgarnes", "akureyri"].map((key) => sampleId(`point:${key}`)) },
  });
  if (!draft.ok) throw new Error(draft.error.code);

  // Saturday, ten minutes before BSÍ: both say they are there, and they write.
  const [bsi] = await db
    .select({ id: schema.tripStops.id, plannedAt: schema.tripStops.plannedAt })
    .from(schema.tripStops)
    .where(eq(schema.tripStops.tripId, sampleTrip.north))
    .orderBy(asc(schema.tripStops.position));
  if (bsi?.plannedAt === null || bsi === undefined) throw new Error("No first stop.");
  await later(
    Math.round((bsi.plannedAt.getTime() - api.now().getTime()) / 1000 - 600),
    anna,
    gunna,
  );
  const passengerIn = await api.client.call(passengerCheckInRoute, {
    accessToken: gunna.accessToken,
    params: { id: bookingId },
    body: {},
  });
  if (!passengerIn.ok) throw new Error(passengerIn.error.code);
  const driverIn = await api.client.call(driverCheckInRoute, {
    accessToken: anna.accessToken,
    params: { id: sampleTrip.north, stopId: bsi.id },
    body: {},
  });
  if (!driverIn.ok) throw new Error(driverIn.error.code);
  for (const [member, text, booking] of [
    [gunna, "I'll wait by the door", bookingId],
    [anna, "See you in a minute", bookingId],
    ...(siggisBookingId === null
      ? []
      : [[anna, "Siggi, I'm by the bus", siggisBookingId] as const]),
  ] as const) {
    const sent = await api.client.call(sendMessageRoute, {
      accessToken: member.accessToken,
      params: { id: booking },
      body: { clientId: randomUUID(), text },
    });
    if (!sent.ok) throw new Error(sent.error.code);
  }
  // Saturday evening: the trip has completed.
  await later(hours(12), anna, gunna, ...(siggi === null ? [] : [siggi]));
  return {
    anna,
    gunna,
    bookingId,
    siggisBookingId,
    usedCar: north.vehicleId,
    spareCar: spare.id,
    draftId: draft.data.id,
  };
}

describe("erasure after the 7 days (spec 11, 3.5)", () => {
  it("erases the person, and keeps the others' trips, bookings and messages with the former member", async () => {
    const { anna, gunna, bookingId, usedCar, spareCar, draftId } = await busyDriver();
    const { db } = api.connection;
    const before = await api.client.call(bookingRoute, {
      accessToken: gunna.accessToken,
      params: { id: bookingId },
    });
    if (!before.ok) throw new Error(before.error.code);
    const [payment] = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.bookingId, bookingId));
    // A problem report of hers about a meeting point, still open (spec 2, 3.5).
    await db.insert(schema.meetingPointIssues).values({
      meetingPointId: sampleId("point:borgarnes"),
      reporterId: anna.userId,
      reason: "unsafe",
      note: "No light after dark.",
    });
    await waitEnded(anna);

    expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });

    expect(await userExists(anna.userId)).toBe(false);
    expect(await rowsNaming(anna.userId)).toEqual([]);
    const [erased] = await db
      .select()
      .from(schema.erasedAccounts)
      .where(eq(schema.erasedAccounts.userId, anna.userId));
    expect(erased?.erasedAt).toEqual(api.now());

    // Her trips: the one done moves with its free text emptied; the one to
    // come is cancelled quietly; the draft is gone.
    const trips = await db
      .select({
        id: schema.trips.id,
        driverId: schema.trips.driverId,
        status: schema.trips.status,
        note: schema.trips.note,
      })
      .from(schema.trips)
      .where(eq(schema.trips.driverId, formerMemberId));
    expect(trips.find((trip) => trip.id === sampleTrip.north)?.note).toBe("");
    expect(trips.find((trip) => trip.id === sampleTrip.vik)?.status).toBe("cancelled");
    expect(trips.some((trip) => trip.id === draftId)).toBe(false);
    const events = await db
      .select({ kind: schema.outboxEvents.kind })
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.kind, "TripCancelled"));
    expect(events).toEqual([]);

    // The car the trip used stays for it, without its plate; the other is gone.
    const cars = await db
      .select()
      .from(schema.vehicles)
      .where(eq(schema.vehicles.ownerId, formerMemberId));
    expect(cars.map((car) => [car.id, car.registration])).toContainEqual([usedCar, null]);
    expect(cars.some((car) => car.id === spareCar)).toBe(false);

    // Gunna's booking, payment and messages are as they were, with "a former member".
    const after = await api.client.call(bookingRoute, {
      accessToken: gunna.accessToken,
      params: { id: bookingId },
    });
    if (!after.ok) throw new Error(after.error.code);
    // The plate went with her car's other details (3.5); the colour is the former member's.
    if (before.data.confirmed === null) throw new Error("Not confirmed.");
    expect(after.data).toEqual({
      ...before.data,
      // No profile, rating or figure: the former member has none.
      driver: {
        firstName: null,
        colour: expect.any(Number) as unknown,
        profileId: null,
        rating: { average: null, count: 0 },
        reliabilityPercent: null,
      },
      confirmed: { ...before.data.confirmed, registration: null },
    });
    expect(
      await db.select().from(schema.payments).where(eq(schema.payments.bookingId, bookingId)),
    ).toEqual([payment]);
    const chat = await api.client.call(conversationMessagesRoute, {
      accessToken: gunna.accessToken,
      params: { id: bookingId },
      query: {},
    });
    if (!chat.ok) throw new Error(chat.error.code);
    const written = chat.data.messages.filter((message) => message.from !== "system");
    expect(written.map((message) => [message.from, message.kind, message.text])).toEqual([
      ["them", "erased", null],
      ["me", "text", "I'll wait by the door"],
    ]);
    const checkIns = await db
      .select({ userId: schema.checkIns.userId })
      .from(schema.checkIns)
      .orderBy(asc(schema.checkIns.checkedInAt));
    expect(checkIns.map((row) => row.userId)).toEqual([gunna.userId, formerMemberId]);

    // Her report stays in the operator's queue, from the former member.
    expect(
      await db
        .select({
          reporterId: schema.meetingPointIssues.reporterId,
          note: schema.meetingPointIssues.note,
          status: schema.meetingPointIssues.status,
        })
        .from(schema.meetingPointIssues),
    ).toEqual([{ reporterId: formerMemberId, note: "No light after dark.", status: "open" }]);

    // Nobody opens a trip page of hers any more.
    expect(
      await api.client.call(tripDetailsRoute, {
        params: { id: sampleTrip.vik },
        query: { seats: 1 },
      }),
    ).toMatchObject({ ok: false, status: 404 });
  });

  it("erases the feedback the person sent, with its screenshot (spec 12, section 7)", async () => {
    const gunna = await newMember("Gunna");
    const sigga = await newMember("Sigga");
    const { db } = api.connection;
    const details = {
      kind: "problem",
      appVersion: "1.4.0",
      platform: "ios",
      osVersion: "19.1",
      screen: "/trips/[id]",
      language: "en",
    };
    const [gone, kept] = await db
      .insert(schema.feedback)
      .values([
        { userId: gunna.userId, message: "Gunna's", ...details },
        { userId: sigga.userId, message: "Sigga's", ...details },
      ])
      .returning({ id: schema.feedback.id });
    if (gone === undefined || kept === undefined) throw new Error("No feedback.");
    await db.insert(schema.feedbackScreenshots).values(
      [gone, kept].map(({ id }) => ({
        feedbackId: id,
        file: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
        width: 390,
        height: 844,
      })),
    );

    await waitEnded(gunna);
    expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });

    expect((await db.select().from(schema.feedback)).map((row) => row.id)).toEqual([kept.id]);
    expect(
      (await db.select().from(schema.feedbackScreenshots)).map((row) => row.feedbackId),
    ).toEqual([kept.id]);
    expect(await rowsNaming(gunna.userId)).toEqual([]);
    await db.delete(schema.feedback);
  });

  it("queues the person's profile photo, so its file leaves photo storage (ADR 0033)", async () => {
    const gunna = await newMember("Gunna");
    const { db } = api.connection;
    const key = "profile-photos/0193f0c4-7d4a-7b1e-9c2a-123456789abc.jpg";
    await db.update(schema.users).set({ photoKey: key }).where(eq(schema.users.id, gunna.userId));

    await waitEnded(gunna);
    expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });

    const queued = await db.select().from(schema.photoFilesToDelete);
    expect(queued).toMatchObject([{ key }]);
    expect(queued[0]?.deleteAfter.getTime()).toBeLessThanOrEqual(api.now().getTime());
    await db.delete(schema.photoFilesToDelete);
  });

  it("erases the person's Google link and a Google sign-in waiting for Settings (spec 19, section 7)", async () => {
    const gunna = await newMember("Gunna");
    const { db } = api.connection;
    const now = api.now();
    await db.insert(schema.identities).values({
      userId: gunna.userId,
      provider: "google",
      subject: `erasure-google-${randomUUID()}`,
      email: "gunna-google@example.com",
      linkedAt: now,
      lastUsedAt: now,
    });
    await db.insert(schema.providerSignIns).values({
      provider: "google",
      stateHash: randomUUID(),
      challenge: "c".repeat(43),
      returnUrl: "shareride://sign-in/return",
      expiresAt: new Date(now.getTime() + 30 * 60_000),
      answeredAt: now,
      subject: `erasure-google-${randomUUID()}`,
      email: "gunna-other@example.com",
      pendingHash: randomUUID(),
      linkUserId: gunna.userId,
    });

    await waitEnded(gunna);
    expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });
    expect(await rowsNaming(gunna.userId)).toEqual([]);
    const left = await db
      .select({ id: schema.providerSignIns.id })
      .from(schema.providerSignIns)
      .where(eq(schema.providerSignIns.email, "gunna-other@example.com"));
    expect(left).toEqual([]);
  });

  it("changes nothing the second time", async () => {
    const { anna, bookingId } = await busyDriver();
    await waitEnded(anna);
    expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });
    const snapshot = async () => ({
      trips: await api.connection.db.select().from(schema.trips).orderBy(asc(schema.trips.id)),
      bookings: await api.connection.db
        .select()
        .from(schema.bookings)
        .where(eq(schema.bookings.id, bookingId)),
      messages: await api.connection.db
        .select()
        .from(schema.messages)
        .orderBy(asc(schema.messages.id)),
    });
    const first = await snapshot();
    await later(hours(1));
    expect(await erasure().eraseDue()).toEqual({ erased: 0, failed: 0 });
    expect(await snapshot()).toEqual(first);
  });

  it("leaves an account kept just before the run, and one whose wait has not ended", async () => {
    const siggi = await newMember("Siggi");
    const palli = await newMember("Palli");
    await waitEnded(siggi);
    await api.connection.db
      .update(schema.users)
      .set({ deleteAfter: null })
      .where(eq(schema.users.id, siggi.userId));
    await api.connection.db
      .update(schema.users)
      .set({ deleteAfter: new Date(api.now().getTime() + 60_000) })
      .where(eq(schema.users.id, palli.userId));
    const run = erasure();

    expect(await run.eraseDue()).toEqual({ erased: 0, failed: 0 });
    // Checked again under the lock, so a kept account is never erased.
    expect(await run.eraseOne(siggi.userId)).toBe(false);
    expect(await userExists(siggi.userId)).toBe(true);
    expect(await userExists(palli.userId)).toBe(true);
  });

  it("waits while something is still open, and says so", async () => {
    await driverOf(sampleTrip.north, "Anna");
    const gunna = await newMember("Gunna");
    await booked(gunna.accessToken, sampleTrip.north, { fromStop: 0, toStop: 3 });
    await waitEnded(gunna);

    expect(await erasure().eraseDue()).toEqual({ erased: 0, failed: 0 });
    expect(await userExists(gunna.userId)).toBe(true);
    expect(logLines.join("\n")).toContain("account erasure waits: something is open");
  });

  it("keeps a suspended person's number from signing up again until the suspension ends", async () => {
    const siggi = await newMember("Siggi");
    const phone = await phoneOf(siggi);
    await waitEnded(siggi, "suspended");

    expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });
    const blocked = await api.connection.db.select().from(schema.blockedNumbers);
    // Without an end to the suspension, the 3 years.
    expect(blocked).toEqual([
      {
        phoneHash: api.features.hasher("phone", phone),
        until: blockedNumberUntil(null, api.now()),
        createdAt: expect.any(Date) as unknown,
      },
    ]);
    await expect(api.signIn(phone)).rejects.toThrow("account_unavailable");

    // After the block, the number can make a new account.
    await api.connection.db
      .update(schema.blockedNumbers)
      .set({ until: new Date(api.now().getTime() - 1000) });
    const again = await api.signIn(phone);
    expect(again.isNewUser).toBe(true);
  });

  it("keeps a number only until a suspension with an end ends", async () => {
    const siggi = await newMember("Siggi");
    const phone = await phoneOf(siggi);
    const ends = new Date(api.now().getTime() + hours(30 * 24) * 1000);
    await waitEnded(siggi, "suspended");
    await api.connection.db
      .update(schema.users)
      .set({ suspendedUntil: ends })
      .where(eq(schema.users.id, siggi.userId));

    expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });
    const blocked = await api.connection.db.select().from(schema.blockedNumbers);
    expect(blocked).toEqual([
      {
        phoneHash: api.features.hasher("phone", phone),
        until: ends,
        createdAt: expect.any(Date) as unknown,
      },
    ]);
  });

  it("keeps no number once the suspension has ended", async () => {
    const siggi = await newMember("Siggi");
    await waitEnded(siggi, "suspended");
    await api.connection.db
      .update(schema.users)
      .set({ suspendedUntil: new Date(api.now().getTime() - 1000) })
      .where(eq(schema.users.id, siggi.userId));

    expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });
    expect(await api.connection.db.select().from(schema.blockedNumbers)).toEqual([]);
  });

  it("lets an active person's number make a new account at once", async () => {
    const palli = await newMember("Palli");
    const phone = await phoneOf(palli);
    await waitEnded(palli);
    expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });

    const again = await api.signIn(phone);
    expect(again).toMatchObject({ isNewUser: true });
    expect(again.userId).not.toBe(palli.userId);
    expect(await api.connection.db.select().from(schema.blockedNumbers)).toEqual([]);
  });

  it("ends an operator's console sign-ins and passkeys, and leaves the audit log as it is", async () => {
    const siggi = await newMember("Siggi");
    const { db } = api.connection;
    const [session] = await db
      .insert(schema.operatorSessions)
      .values({ userId: siggi.userId, tokenHash: randomUUID() })
      .returning({ id: schema.operatorSessions.id });
    if (session === undefined) throw new Error("No session.");
    await db.insert(schema.operatorPasskeys).values({
      userId: siggi.userId,
      credentialId: randomUUID(),
      publicKey: "key",
      backedUp: true,
      name: "Laptop",
    });
    await recordAudit(db, {
      operator: { userId: siggi.userId, sessionId: session.id },
      action: "meeting_point.create",
      subjectType: "meeting_point",
      subjectId: randomUUID(),
      request: null,
    });
    await waitEnded(siggi);

    expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });
    expect(await rowsNaming(siggi.userId)).toEqual([]);
    const audit = await db
      .select({ operatorUserId: schema.auditLog.operatorUserId })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.operatorUserId, siggi.userId));
    expect(audit).toHaveLength(1);
  });

  it("keeps a conversation with a former member closed both ways", async () => {
    // Anna erased: Gunna cannot write to the former member.
    const { anna, gunna, bookingId } = await busyDriver();
    await waitEnded(anna);
    expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });
    expect(await canWriteTo(gunna.accessToken, bookingId)).toBe(false);
    expect(
      await api.client.call(sendMessageRoute, {
        accessToken: gunna.accessToken,
        params: { id: bookingId },
        body: { clientId: randomUUID(), text: "Thanks for the ride" },
      }),
    ).toMatchObject({ ok: false, status: 409, error: { code: "chat_closed" } });
  });

  it("leaves a former member out of a driver's message to all passengers", async () => {
    const anna = await driverOf(sampleTrip.north, "Anna");
    const gunna = await newMember("Gunna");
    const bookingId = await confirmedOnNorth(anna, gunna);
    // Saturday evening: the trip has completed, and its conversations are open.
    await later(hours(32), anna, gunna);
    await waitEnded(gunna);
    expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });

    expect(await canWriteTo(anna.accessToken, bookingId)).toBe(false);
    expect(
      await api.client.call(messageAllPassengersRoute, {
        accessToken: anna.accessToken,
        params: { id: sampleTrip.north },
        body: { clientId: randomUUID(), text: "Thanks, everyone" },
      }),
    ).toMatchObject({ ok: true, data: { sent: 0 } });
  });

  it("ends a trip of theirs nobody holds a seat on, even once it has left its first stop", async () => {
    // Sunday 10:01: Jón's trip to Vík has left Selfoss, and its later stops
    // still take bookings.
    const jon = await driverOf(sampleTrip.vik, "Jón");
    await later(hours(46) + 60, jon);
    await waitEnded(jon);

    expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });
    const [trip] = await api.connection.db
      .select({ status: schema.trips.status })
      .from(schema.trips)
      .where(eq(schema.trips.id, sampleTrip.vik));
    expect(trip?.status).toBe("cancelled");
  });

  it("books nobody on a trip left with the former member", async () => {
    // As a trip under way with passengers is, until it completes.
    const shown = await details(sampleTrip.vik, 0, 1);
    await api.connection.db
      .update(schema.trips)
      .set({ driverId: formerMemberId })
      .where(eq(schema.trips.id, sampleTrip.vik));
    const palli = await newMember("Palli");
    expect(
      await api.client.call(bookTripRoute, {
        accessToken: palli.accessToken,
        params: { id: sampleTrip.vik },
        body: {
          fromStop: 0,
          toStop: 1,
          seats: 1,
          total: shown.part.total,
          message: "",
          attemptKey: randomUUID(),
        },
      }),
    ).toMatchObject({ ok: false, status: 404, error: { code: "not_found" } });
  });

  it("empties the driver's cancel note and the operator's note on the passengers' bookings and in their chat", async () => {
    const anna = await driverOf(sampleTrip.north, "Anna");
    const gunna = await newMember("Gunna");
    const bookingId = await confirmedOnNorth(anna, gunna);
    const cancelled = await api.client.call(cancelTripRoute, {
      accessToken: anna.accessToken,
      params: { id: sampleTrip.north },
      body: { reason: "illness", note: "Sorry, my daughter is ill", countsOnReliability: true },
    });
    if (!cancelled.ok) throw new Error(cancelled.error.code);
    // An operator's note on why it counts is about the driver too (spec 8, 6).
    await api.connection.db
      .update(schema.bookings)
      .set({ overruleNote: "Ill again, third time this month" })
      .where(eq(schema.bookings.id, bookingId));
    await waitEnded(anna);

    expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });
    const { db } = api.connection;
    const [booking] = await db
      .select({
        cancelNote: schema.bookings.cancelNote,
        overruleNote: schema.bookings.overruleNote,
        reason: schema.bookings.cancelReason,
      })
      .from(schema.bookings)
      .where(eq(schema.bookings.id, bookingId));
    expect(booking).toEqual({ cancelNote: "", overruleNote: "", reason: "illness" });
    const chat = await api.client.call(conversationMessagesRoute, {
      accessToken: gunna.accessToken,
      params: { id: bookingId },
      query: {},
    });
    if (!chat.ok) throw new Error(chat.error.code);
    expect(chat.data.messages.map((message) => message.system)).toContainEqual({
      key: "cancelled",
      by: "them",
      reason: "illness",
      note: "",
      wholeTrip: true,
    });
    const notes = await db
      .select({ params: schema.messages.params })
      .from(schema.messages)
      .where(sql`${schema.messages.params}::text like '%daughter%'`);
    expect(notes).toEqual([]);
  });

  it("waits for an open report about a ride, then keeps how it ended without the notes", async () => {
    const { anna, bookingId } = await busyDriver();
    const { db } = api.connection;
    // Anna said Gunna did not come; Gunna has not answered.
    const [dispute] = await db
      .insert(schema.disputes)
      .values({ bookingId, kind: "no_show", raisedAt: api.now(), note: "Waited ten minutes" })
      .returning({ id: schema.disputes.id });
    if (dispute === undefined) throw new Error("No dispute.");
    await waitEnded(anna);

    expect(await erasure().eraseDue()).toEqual({ erased: 0, failed: 0 });
    expect(await userExists(anna.userId)).toBe(true);
    // And "Delete my account" shows it as something to settle first.
    expect(
      await api.client.call(deletionCheckRoute, { accessToken: anna.accessToken }),
    ).toMatchObject({
      ok: true,
      data: { allowed: false, mustSettle: [{ kind: "dispute", id: dispute.id }] },
    });

    await db
      .update(schema.disputes)
      .set({ outcome: "stands", decidedBy: "system", decidedAt: api.now() })
      .where(eq(schema.disputes.id, dispute.id));
    expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });
    const [after] = await db
      .select({
        kind: schema.disputes.kind,
        outcome: schema.disputes.outcome,
        note: schema.disputes.note,
        answerNote: schema.disputes.answerNote,
        decisionNote: schema.disputes.decisionNote,
      })
      .from(schema.disputes)
      .where(eq(schema.disputes.id, dispute.id));
    expect(after).toEqual({
      kind: "no_show",
      outcome: "stands",
      note: "",
      answerNote: "",
      decisionNote: "",
    });
  });

  describe("a conversation a report covers (spec 9, section 7)", () => {
    /**
     * Gunna reports Anna's message; Anna also said she was running late, and
     * wrote to Siggi, whom nobody reported. The report closed `closedAt` ms
     * after the 3 years' start, if it is closed.
     */
    async function reported(status: "open" | "closed", closedAt = 0) {
      const ride = await busyDriver({ siggi: true });
      const cutoff = reportsClosedBy(api.now(), defaultSafetySettings).getTime();
      const { db } = api.connection;
      const conversationId = await conversationOf(ride.bookingId);
      const [said] = await db
        .select({ id: schema.messages.id })
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.conversationId, conversationId),
            eq(schema.messages.senderId, ride.anna.userId),
          ),
        );
      if (said === undefined) throw new Error("Anna wrote nothing.");
      await db.insert(schema.messages).values({
        conversationId,
        senderId: ride.anna.userId,
        kind: "quick",
        key: "late",
        params: { minutes: 10 },
        clientId: randomUUID(),
        sentAt: api.now(),
      });
      await db.insert(schema.reports).values({
        reporterId: ride.gunna.userId,
        subjectUserId: ride.anna.userId,
        subject: "message",
        tripId: sampleTrip.north,
        bookingId: ride.bookingId,
        messageId: said.id,
        conversationId,
        category: "harassment",
        description: "She was rude",
        urgent: false,
        status,
        outcome: status === "closed" ? "action_taken" : null,
        closedAt: status === "closed" ? new Date(cutoff + closedAt) : null,
      });
      if (ride.siggisBookingId === null) throw new Error("Siggi did not ride.");
      return {
        ...ride,
        siggisBookingId: ride.siggisBookingId,
        conversationId,
        siggisConversationId: await conversationOf(ride.siggisBookingId),
      };
    }

    async function conversationOf(bookingId: string) {
      const [row] = await api.connection.db
        .select({ id: schema.conversations.id })
        .from(schema.conversations)
        .where(eq(schema.conversations.bookingId, bookingId));
      if (row === undefined) throw new Error("No conversation.");
      return row.id;
    }

    /** What a conversation holds apart from ShareRide's lines, oldest first. */
    const written = (conversationId: string) =>
      api.connection.db
        .select({
          senderId: schema.messages.senderId,
          kind: schema.messages.kind,
          body: schema.messages.body,
          key: schema.messages.key,
          params: schema.messages.params,
          clientId: schema.messages.clientId,
          erasedAt: schema.messages.erasedAt,
          sentAs: schema.messages.sentAs,
        })
        .from(schema.messages)
        .where(
          and(
            eq(schema.messages.conversationId, conversationId),
            ne(schema.messages.kind, "system"),
          ),
        )
        .orderBy(asc(schema.messages.sentAt), asc(schema.messages.id));

    async function gunnaReads(gunna: Member, bookingId: string) {
      const chat = await api.client.call(conversationMessagesRoute, {
        accessToken: gunna.accessToken,
        params: { id: bookingId },
        query: {},
      });
      if (!chat.ok) throw new Error(chat.error.code);
      return chat.data.messages
        .filter((message) => message.from !== "system")
        .map((message) => [message.from, message.kind, message.text]);
    }

    it.each([
      ["open", "open" as const],
      ["closed under 3 years ago", "closed" as const],
    ])(
      "keeps what it said for the operator while the report is %s; the others see it deleted",
      async (_label, status) => {
        // A millisecond inside the 3 years, if closed.
        const ride = await reported(status, 1);
        const { anna, gunna, bookingId, conversationId } = ride;
        const before = await written(conversationId);
        await waitEnded(anna);

        expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });

        expect(await rowsNaming(anna.userId)).toEqual([]);
        const after = await written(conversationId);
        expect(after).toEqual(
          before.map((message) =>
            message.senderId === gunna.userId
              ? message
              : {
                  ...message,
                  senderId: formerMemberId,
                  clientId: expect.any(String) as unknown,
                  erasedAt: api.now(),
                  sentAs: "driver",
                },
          ),
        );
        // New retry keys, as for every row moved to the former member.
        const keys = after.map((message) => message.clientId);
        for (const message of before) {
          if (message.senderId === anna.userId) expect(keys).not.toContain(message.clientId);
        }
        // Gunna sees it deleted, in the app and in Download my data.
        // Newest first: Anna's "running late", her text, then Gunna's own.
        expect(await gunnaReads(gunna, bookingId)).toEqual([
          ["them", "erased", null],
          ["them", "erased", null],
          ["me", "text", "I'll wait by the door"],
        ]);
        const data = await collectExport(api.connection.db, gunna.userId, api.now());
        const talks = data.sections.conversations as readonly {
          readonly bookingId: string;
          readonly messages: readonly Readonly<
            Record<"from" | "text" | "key" | "params", unknown>
          >[];
        }[];
        const exported = talks.find((talk) => talk.bookingId === bookingId);
        expect(
          exported?.messages
            .filter((message) => message.from !== "ShareRide")
            .map(({ text, key, params }) => ({ text, key, params })),
        ).toEqual([
          { text: "I'll wait by the door", key: null, params: null },
          { text: "Message deleted", key: null, params: null },
          { text: "Message deleted", key: null, params: null },
        ]);
        // What she wrote to Siggi, whom nobody reported, is emptied as usual.
        expect(await written(ride.siggisConversationId)).toEqual([
          {
            senderId: formerMemberId,
            kind: "text",
            body: null,
            key: null,
            params: null,
            clientId: expect.any(String) as unknown,
            erasedAt: api.now(),
            sentAs: null,
          },
        ]);
      },
    );

    it("empties it as usual once the report closed 3 years ago", async () => {
      const { anna, conversationId } = await reported("closed", 0);
      await waitEnded(anna);

      expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });

      expect(
        (await written(conversationId))
          .filter((message) => message.senderId === formerMemberId)
          .map(({ body, key, params, erasedAt, sentAs }) => ({
            body,
            key,
            params,
            erasedAt,
            sentAs,
          })),
      ).toEqual([
        { body: null, key: null, params: null, erasedAt: api.now(), sentAs: null },
        { body: null, key: null, params: null, erasedAt: api.now(), sentAs: null },
      ]);
    });

    it("shows the operator who said what once both people are erased", async () => {
      const { anna, gunna, bookingId } = await reported("open");
      const { db } = api.connection;
      // A contested report about the ride, decided, also lets the operator read it.
      const [dispute] = await db
        .insert(schema.disputes)
        .values({
          bookingId,
          kind: "no_show",
          raisedAt: api.now(),
          answer: "contested",
          answeredAt: api.now(),
          outcome: "rode",
          decidedBy: "operator",
          decidedAt: api.now(),
        })
        .returning({ id: schema.disputes.id });
      if (dispute === undefined) throw new Error("No dispute.");
      await waitEnded(gunna);
      expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });
      await waitEnded(anna);
      expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });

      const operator = await api.signInOperator();
      const read = await readConversationAsOperator(db, {
        subject: { type: "dispute", id: dispute.id },
        operator: { userId: operator.userId, sessionId: operator.sessionId },
        request: null,
      });
      if (!read.ok) throw new Error(read.error.code);
      expect(
        read.value
          .filter((message) => message.from !== "system")
          .map(({ from, kind, text, quick }) => ({ from, kind, text, quick })),
      ).toEqual([
        { from: "passenger", kind: "text", text: "I'll wait by the door", quick: null },
        { from: "driver", kind: "text", text: "See you in a minute", quick: null },
        { from: "driver", kind: "quick", text: null, quick: { key: "late", minutes: 10 } },
      ]);
    });
  });

  it("erases the reviews about the person, and keeps those they wrote by the former member", async () => {
    const { anna, gunna, bookingId } = await busyDriver();
    const { db } = api.connection;
    // Both reviewed the ride, and each sees the other's.
    await db.insert(schema.reviews).values([
      {
        bookingId,
        authorId: gunna.userId,
        subjectId: anna.userId,
        authorRole: "passenger",
        rating: 5,
        comment: "Lovely drive",
        revealedAt: api.now(),
      },
      {
        bookingId,
        authorId: anna.userId,
        subjectId: gunna.userId,
        authorRole: "driver",
        rating: 4,
        comment: "On time",
        revealedAt: api.now(),
      },
    ]);
    const reviewsOfRide = () =>
      db
        .select({
          authorId: schema.reviews.authorId,
          subjectId: schema.reviews.subjectId,
          comment: schema.reviews.comment,
        })
        .from(schema.reviews)
        .where(eq(schema.reviews.bookingId, bookingId));

    await waitEnded(gunna);
    expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });
    expect(await reviewsOfRide()).toEqual([
      { authorId: formerMemberId, subjectId: anna.userId, comment: "Lovely drive" },
    ]);

    // Then Anna goes too: the review about her goes with her.
    await waitEnded(anna);
    expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });
    expect(await reviewsOfRide()).toEqual([]);
    expect(await rowsNaming(anna.userId)).toEqual([]);
  });

  it("erases the notes about the person, and keeps those an operator wrote by the former member", async () => {
    const siggi = await newMember("Siggi");
    const gunna = await newMember("Gunna");
    const anna = await newMember("Anna");
    const { db } = api.connection;
    await db.insert(schema.operatorNotes).values([
      { userId: gunna.userId, byId: siggi.userId, text: "Called her." },
      { userId: anna.userId, byId: siggi.userId, text: "Refund sent." },
    ]);
    const notes = () =>
      db
        .select({
          userId: schema.operatorNotes.userId,
          byId: schema.operatorNotes.byId,
          text: schema.operatorNotes.text,
        })
        .from(schema.operatorNotes)
        .where(inArray(schema.operatorNotes.userId, [gunna.userId, anna.userId]))
        .orderBy(asc(schema.operatorNotes.text));

    await waitEnded(gunna);
    expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });
    expect(await notes()).toEqual([
      { userId: anna.userId, byId: siggi.userId, text: "Refund sent." },
    ]);

    // Then Siggi, the operator, goes: the note about Anna stays for the console.
    await waitEnded(siggi);
    expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 0 });
    expect(await notes()).toEqual([
      { userId: anna.userId, byId: formerMemberId, text: "Refund sent." },
    ]);
    expect(await rowsNaming(siggi.userId)).toEqual([]);
  });

  it("erases two passengers whose bookings share a retry key", async () => {
    const gunna = await newMember("Gunna");
    const siggi = await newMember("Siggi");
    const { db } = api.connection;
    const ids: string[] = [];
    for (const member of [gunna, siggi]) {
      const booking = await booked(member.accessToken, sampleTrip.north, {
        fromStop: 0,
        toStop: 1,
      });
      ids.push(booking.id);
    }
    // Each passenger's keys are their own, so two people can send the same;
    // both bookings were cancelled, so nothing is open.
    await db
      .update(schema.bookings)
      .set({
        attemptKey: randomUUID(),
        status: "cancelled",
        cancelledAt: api.now(),
        cancelledBy: "passenger",
      })
      .where(inArray(schema.bookings.id, ids));
    await waitEnded(gunna);
    await waitEnded(siggi);

    expect(await erasure().eraseDue()).toEqual({ erased: 2, failed: 0 });

    const moved = await db
      .select({ passengerId: schema.bookings.passengerId })
      .from(schema.bookings)
      .where(inArray(schema.bookings.id, ids));
    expect(moved).toEqual([{ passengerId: formerMemberId }, { passengerId: formerMemberId }]);
  });

  it("goes on with the others when one account fails, and reports it", async () => {
    const siggi = await newMember("Siggi");
    const palli = await newMember("Palli");
    const { pool } = api.connection;
    // A table the catalogue does not know holds on to Siggi's row.
    await pool.query(`CREATE TABLE erasure_test_hold (user_id uuid REFERENCES users (id))`);
    try {
      await pool.query(`INSERT INTO erasure_test_hold VALUES ($1)`, [siggi.userId]);
      await waitEnded(siggi);
      await waitEnded(palli);

      expect(await erasure().eraseDue()).toEqual({ erased: 1, failed: 1 });
      expect(await userExists(siggi.userId)).toBe(true);
      expect(await userExists(palli.userId)).toBe(false);
      const failure = logLines.find((line) => line.includes("account erasure failed"));
      expect(failure).toContain(siggi.userId);
    } finally {
      await pool.query(`DROP TABLE erasure_test_hold`);
    }
  });

  it("erases again, after a restore, an account that came back", async () => {
    const siggi = await newMember("Siggi");
    await api.connection.db
      .insert(schema.erasedAccounts)
      .values({ userId: siggi.userId, erasedAt: api.now() });

    expect(await erasure().reapply()).toEqual({ datesTaken: 0, erased: 1, failed: 0 });
    expect(await userExists(siggi.userId)).toBe(false);
    expect(await erasure().reapply()).toEqual({ datesTaken: 0, erased: 0, failed: 0 });
  });

  it("takes the erasures made after the restore's point from the old database", async () => {
    // Erased in the old database at 11:00; the restored one has the account
    // and no record of it.
    const siggi = await newMember("Siggi");
    const erasedAt = new Date(api.now().getTime() - hours(1) * 1000);
    const before = {
      erasures: [
        { userId: siggi.userId, erasedAt },
        { userId: randomUUID(), erasedAt },
      ],
      accounts: [],
    };

    expect(await erasure().reapply(before)).toEqual({ datesTaken: 0, erased: 1, failed: 0 });
    expect(await userExists(siggi.userId)).toBe(false);
    // Kept with the first erasure's time, for a later restore.
    const kept = await api.connection.db
      .select()
      .from(schema.erasedAccounts)
      .where(eq(schema.erasedAccounts.userId, siggi.userId));
    expect(kept).toEqual([{ userId: siggi.userId, erasedAt }]);
    expect(await erasure().reapply(before)).toEqual({ datesTaken: 0, erased: 0, failed: 0 });
  });

  it("takes from the old database each deletion date changed there last", async () => {
    const { db } = api.connection;
    const at = (minutes: number) => new Date(api.now().getTime() + minutes * 60_000);
    const dated = async (member: Member, deleteAfter: Date | null, updatedAt: Date) => {
      await db
        .update(schema.users)
        .set({ deleteAfter, updatedAt })
        .where(eq(schema.users.id, member.userId));
    };
    // In the restored database: Siggi's wait has ended, Palli has none,
    // and Jón asked on the restored database after the move.
    const siggi = await newMember("Siggi");
    const palli = await newMember("Palli");
    const jon = await newMember("Jón");
    await dated(siggi, at(-60), at(-120));
    await dated(palli, null, at(-120));
    await dated(jon, at(7 * 24 * 60), at(-10));
    const before = {
      erasures: [],
      accounts: [
        // Siggi kept the account after the restore's point; Palli asked.
        { userId: siggi.userId, deleteAfter: null, updatedAt: at(-30) },
        { userId: palli.userId, deleteAfter: at(7 * 24 * 60 - 30), updatedAt: at(-30) },
        // The old database's word on Jón is older than the restored one's.
        { userId: jon.userId, deleteAfter: null, updatedAt: at(-60) },
      ],
    };

    expect(await erasure().reapply(before)).toEqual({ datesTaken: 2, erased: 0, failed: 0 });
    const dates = await db
      .select({ id: schema.users.id, deleteAfter: schema.users.deleteAfter })
      .from(schema.users)
      .where(inArray(schema.users.id, [siggi.userId, palli.userId, jon.userId]));
    expect(new Map(dates.map((row) => [row.id, row.deleteAfter]))).toEqual(
      new Map([
        [siggi.userId, null],
        [palli.userId, at(7 * 24 * 60 - 30)],
        [jon.userId, at(7 * 24 * 60)],
      ]),
    );
    // So the next run does not erase the account Siggi kept.
    expect(await erasure().eraseDue()).toEqual({ erased: 0, failed: 0 });
    expect(await erasure().reapply(before)).toEqual({ datesTaken: 0, erased: 0, failed: 0 });
  });

  it("goes on erasing again when one account fails, and counts it", async () => {
    const siggi = await newMember("Siggi");
    const palli = await newMember("Palli");
    const { db, pool } = api.connection;
    await db.insert(schema.erasedAccounts).values([
      { userId: siggi.userId, erasedAt: api.now() },
      { userId: palli.userId, erasedAt: api.now() },
    ]);
    await pool.query(`CREATE TABLE erasure_test_hold (user_id uuid REFERENCES users (id))`);
    try {
      await pool.query(`INSERT INTO erasure_test_hold VALUES ($1)`, [siggi.userId]);
      expect(await erasure().reapply()).toEqual({ datesTaken: 0, erased: 1, failed: 1 });
      expect(await userExists(siggi.userId)).toBe(true);
      expect(await userExists(palli.userId)).toBe(false);
    } finally {
      await pool.query(`DROP TABLE erasure_test_hold`);
    }
  });
});

describe("the privacy command", () => {
  async function run(...args: string[]) {
    return runFrom(undefined, ...args);
  }

  async function runFrom(before: ReadBeforeRestore | undefined, ...args: string[]) {
    const lines: string[] = [];
    const exitCode = await runPrivacyCommand(args, {
      db: api.connection.db,
      clock: () => api.now(),
      erasure: erasure(),
      before,
      write: (line) => lines.push(line),
    });
    return { exitCode, output: lines.join("\n") };
  }

  it("erases again the accounts that came back with a restore", async () => {
    const siggi = await newMember("Siggi");
    await api.connection.db
      .insert(schema.erasedAccounts)
      .values({ userId: siggi.userId, erasedAt: api.now() });

    expect(await run("reapply-erasures")).toEqual({
      exitCode: 0,
      output: "Erased again: 1 account that came back with the restore.",
    });
    expect(await userExists(siggi.userId)).toBe(false);
    expect(await run("reapply-erasures")).toEqual({
      exitCode: 0,
      output: "No erased account came back with the restore.",
    });
  });

  it("reads the old database when it is given", async () => {
    const siggi = await newMember("Siggi");
    const palli = await newMember("Palli");
    await api.connection.db
      .update(schema.users)
      .set({ updatedAt: api.now() })
      .where(eq(schema.users.id, palli.userId));
    const before = () =>
      Promise.resolve({
        erasures: [{ userId: siggi.userId, erasedAt: api.now() }],
        accounts: [
          {
            userId: palli.userId,
            deleteAfter: new Date(api.now().getTime() + hours(24) * 1000),
            updatedAt: new Date(api.now().getTime() + 60_000),
          },
        ],
      });

    expect(await runFrom(before, "reapply-erasures")).toEqual({
      exitCode: 0,
      output: [
        "The old database lists 1 erased account.",
        "Deletion dates taken from the old database: 1.",
        "Erased again: 1 account that came back with the restore.",
      ].join("\n"),
    });
    expect(await userExists(siggi.userId)).toBe(false);
  });

  it("fails when an account could not be erased again", async () => {
    const siggi = await newMember("Siggi");
    const { db, pool } = api.connection;
    await db.insert(schema.erasedAccounts).values({ userId: siggi.userId, erasedAt: api.now() });
    await pool.query(`CREATE TABLE erasure_test_hold (user_id uuid REFERENCES users (id))`);
    try {
      await pool.query(`INSERT INTO erasure_test_hold VALUES ($1)`, [siggi.userId]);
      expect(await run("reapply-erasures")).toEqual({
        exitCode: 1,
        output: [
          "No erased account came back with the restore.",
          "Failed: 1 account, each in the log. Fix it and run this again before the services use this database.",
        ].join("\n"),
      });
    } finally {
      await pool.query(`DROP TABLE erasure_test_hold`);
    }
  });

  it("shows how to use it", async () => {
    for (const args of [[], ["reapply"], ["reapply-erasures", "now"]]) {
      const { exitCode, output } = await run(...args);
      expect(exitCode).toBe(2);
      expect(output).toContain("privacy reapply-erasures");
    }
  });
});
