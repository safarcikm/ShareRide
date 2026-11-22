import { randomInt, randomUUID } from "node:crypto";
import {
  acceptRequestRoute,
  bookTripRoute,
  cancelDeletionRoute,
  createTripRoute,
  deleteAccountRoute,
  deletionCheckRoute,
  getMeRoute,
  messageAllPassengersRoute,
  myConversationsRoute,
  publishTripRoute,
  refreshRoute,
  sendConfirmCodeRoute,
  sendMessageRoute,
  soonestTripsRoute,
  tripDetailsRoute,
  withdrawRequestRoute,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { sampleId } from "@shareride/db/seed";
import { defaultTripDaySettings } from "@shareride/domain";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLogger } from "../../logger.ts";
import { createFakeEmailSender } from "../../platform/email.ts";
import { createFakePushSender } from "../../platform/push.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  hours,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";
import { createAuthService } from "../auth/service.ts";
import { createNotificationWorker } from "../notifications/worker.ts";
import { createDeletionService } from "./deletion.ts";

// "Delete my account" (spec 11, 3.4; plan 4.5). The sample trips at the test
// clock (Friday 13 November 2026, noon): Anna drives BSÍ to Akureyri on
// Saturday at 09:00 by approval; Jón drives Selfoss to Vík on Sunday at
// 10:00, instant, with nobody booked.

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  await freshSampleTrips(api);
  await api.connection.db.delete(schema.outboxEvents);
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, later, rewind, driverOf, book, booked, paid } = bookingHelpers(() => api);

const days = (count: number) => hours(24 * count);

async function phoneOf(member: Member): Promise<string> {
  const [user] = await api.connection.db
    .select({ phone: schema.users.phoneE164 })
    .from(schema.users)
    .where(eq(schema.users.id, member.userId));
  if (user === undefined || user.phone === null) throw new Error("The member has no number.");
  return user.phone;
}

/** Sends a confirm code to the member's own number and gives it back. */
async function freshCode(member: Member): Promise<string> {
  // The sign-in code went a moment ago; one code per 30 seconds (R1.3).
  await later(31, member);
  const sent = await api.client.call(sendConfirmCodeRoute, {
    accessToken: member.accessToken,
    body: {},
  });
  if (!sent.ok) throw new Error(sent.error.code);
  return api.lastCode(await phoneOf(member));
}

function check(member: Member) {
  return api.client.call(deletionCheckRoute, { accessToken: member.accessToken });
}

function deleteAccount(member: Member, code: string) {
  return api.client.call(deleteAccountRoute, { accessToken: member.accessToken, body: { code } });
}

function me(accessToken: string) {
  return api.client.call(getMeRoute, { accessToken });
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

function soonestIds(accessToken: string) {
  return api.client
    .call(soonestTripsRoute, { accessToken, query: { limit: 50 } })
    .then((result) => {
      if (!result.ok) throw new Error(result.error.code);
      return result.data.results.map((trip) => trip.tripId);
    });
}

/** Whether the conversation of `bookingId` shows as open for writing to `accessToken`'s person. */
async function canWriteTo(accessToken: string, bookingId: string) {
  const list = await api.client.call(myConversationsRoute, { accessToken });
  if (!list.ok) throw new Error(list.error.code);
  const found = list.data.conversations.find(
    (conversation) => conversation.booking.id === bookingId,
  );
  if (found === undefined) throw new Error("No such conversation.");
  return found.canWrite;
}

function detailsOf(tripId: string) {
  return api.client.call(tripDetailsRoute, { params: { id: tripId }, query: { seats: 1 } });
}

describe("delete my account (spec 11, 3.4)", () => {
  it("is refused without a fresh code, and nothing changes", async () => {
    const gunna = await newMember("Gunna");
    expect(await deleteAccount(gunna, "123456")).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "code_expired" },
    });
    const code = await freshCode(gunna);
    expect(await deleteAccount(gunna, code === "000000" ? "111111" : "000000")).toMatchObject({
      ok: false,
      status: 400,
      error: { code: "code_invalid" },
    });
    expect(await me(gunna.accessToken)).toMatchObject({
      ok: true,
      data: { deletionScheduledFor: null },
    });
  });

  it("lists what is open, and refuses while it is before the code is used", async () => {
    const anna = await driverOf(sampleTrip.north, "Anna");
    const gunna = await newMember("Gunna");
    const request = await booked(gunna.accessToken, sampleTrip.north, { fromStop: 0, toStop: 3 });

    const asked = await check(gunna);
    if (!asked.ok) throw new Error(asked.error.code);
    expect(asked.data.allowed).toBe(false);
    expect(asked.data.mustSettle).toEqual([]);
    expect(asked.data.canCancel).toEqual([
      {
        kind: "request",
        id: request.id,
        tripId: sampleTrip.north,
        boardsAt: request.board.plannedAt,
        places: {
          from: { is: "BSÍ", en: "BSÍ bus terminal" },
          to: {
            is: request.alight.meetingPoint.name.is,
            en: request.alight.meetingPoint.name.en,
          },
        },
      },
    ]);
    const driving = await check(anna);
    expect(driving).toMatchObject({
      ok: true,
      data: { allowed: false, mustSettle: [], canCancel: [{ kind: "trip", id: sampleTrip.north }] },
    });

    const code = await freshCode(gunna);
    expect(await deleteAccount(gunna, code)).toMatchObject({
      ok: false,
      status: 409,
      error: { code: "deletion_blocked" },
    });
    const withdrawn = await api.client.call(withdrawRequestRoute, {
      accessToken: gunna.accessToken,
      params: { id: request.id },
      body: {},
    });
    expect(withdrawn.ok).toBe(true);
    expect(await check(gunna)).toMatchObject({ ok: true, data: { allowed: true, canCancel: [] } });

    // The refusal left the code unused.
    const deleted = await deleteAccount(gunna, code);
    expect(deleted).toMatchObject({ ok: true, status: 202 });
    if (!deleted.ok) throw new Error(deleted.error.code);
    expect(new Date(deleted.data.deleteAfter)).toEqual(
      new Date(api.now().getTime() + days(7) * 1000),
    );
  });

  it("checks again with the code, so a request made meanwhile still stops it", async () => {
    const anna = await driverOf(sampleTrip.north, "Anna");
    const gunna = await newMember("Gunna");
    const code = await freshCode(anna);
    const auth = createAuthService({
      ...api.features,
      logger: createLogger({ level: "silent" }),
      randomInt: (max) => randomInt(max),
    });
    let requestId: string | undefined;
    const deletion = createDeletionService({
      db: api.connection.db,
      clock: () => api.now(),
      // Gunna asks for a seat after the first check, before the code is checked.
      auth: {
        withConfirmCode: async (userId, given, action) => {
          requestId = (
            await booked(gunna.accessToken, sampleTrip.north, { fromStop: 0, toStop: 3 })
          ).id;
          return auth.withConfirmCode(userId, given, action);
        },
      },
      tripDaySettings: defaultTripDaySettings,
      logger: createLogger({ level: "silent" }),
    });

    expect(await deletion.schedule(anna.userId, code)).toEqual({
      ok: false,
      error: { code: "deletion_blocked" },
    });
    const [row] = await api.connection.db
      .select({ deleteAfter: schema.users.deleteAfter })
      .from(schema.users)
      .where(eq(schema.users.id, anna.userId));
    expect(row?.deleteAfter).toBeNull();
    expect((await me(anna.accessToken)).ok).toBe(true);

    // The code was kept: once the request is withdrawn, it works.
    if (requestId === undefined) throw new Error("No request.");
    const withdrawn = await api.client.call(withdrawRequestRoute, {
      accessToken: gunna.accessToken,
      params: { id: requestId },
      body: {},
    });
    if (!withdrawn.ok) throw new Error(withdrawn.error.code);
    expect(await deleteAccount(anna, code)).toMatchObject({ ok: true, status: 202 });
  });

  it("waits while a trip is under way, until it completes", async () => {
    const anna = await driverOf(sampleTrip.north, "Anna");
    const gunna = await newMember("Gunna");
    await confirmedOnNorth(anna, gunna);

    // Saturday 10:00: on the road since 09:00.
    await later(hours(22), anna, gunna);
    for (const member of [gunna, anna]) {
      const found = await check(member);
      if (!found.ok) throw new Error(found.error.code);
      expect(found.data).toMatchObject({
        allowed: false,
        canCancel: [],
        mustSettle: [{ kind: "trip_under_way", tripId: sampleTrip.north }],
      });
    }

    // Long after it arrived and completed (R8.1).
    await later(hours(12), gunna);
    expect(await check(gunna)).toMatchObject({ ok: true, data: { allowed: true } });
  });

  it("signs the person out everywhere and hides them at once", async () => {
    const jon = await driverOf(sampleTrip.vik, "Jón");
    const otherDevice = await api.signIn(await phoneOf(jon));
    const gunna = await newMember("Gunna");
    expect(await soonestIds(gunna.accessToken)).toContain(sampleTrip.vik);
    expect((await detailsOf(sampleTrip.vik)).ok).toBe(true);

    const deleted = await deleteAccount(jon, await freshCode(jon));
    expect(deleted).toMatchObject({ ok: true, status: 202 });

    // Signed out of both devices: neither token nor refresh works.
    expect(await me(jon.accessToken)).toMatchObject({ ok: false, status: 401 });
    expect(await me(otherDevice.accessToken)).toMatchObject({ ok: false, status: 401 });
    for (const refreshToken of [jon.refreshToken, otherDevice.refreshToken]) {
      expect((await api.client.call(refreshRoute, { body: { refreshToken } })).ok).toBe(false);
    }

    // Gone from the rides leaving soon, trip details and booking.
    expect(await soonestIds(gunna.accessToken)).not.toContain(sampleTrip.vik);
    expect(await detailsOf(sampleTrip.vik)).toMatchObject({ ok: false, status: 404 });
    expect(
      await api.client.call(bookTripRoute, {
        accessToken: gunna.accessToken,
        params: { id: sampleTrip.vik },
        body: {
          seats: 1,
          fromStop: 0,
          toStop: 3,
          total: { amount: 1, currency: "ISK" },
          message: "",
          attemptKey: randomUUID(),
        },
      }),
    ).toMatchObject({ ok: false, status: 404, error: { code: "not_found" } });
  });

  it("lets nobody message a person deleting their account", async () => {
    const anna = await driverOf(sampleTrip.north, "Anna");
    const gunna = await newMember("Gunna");
    const bookingId = await confirmedOnNorth(anna, gunna);
    // Saturday evening: the trip has completed, and its conversations are open.
    await later(hours(32), anna, gunna);
    expect(await deleteAccount(gunna, await freshCode(gunna))).toMatchObject({ ok: true });

    expect(
      await api.client.call(sendMessageRoute, {
        accessToken: anna.accessToken,
        params: { id: bookingId },
        body: { clientId: randomUUID(), text: "Thanks for the ride" },
      }),
    ).toMatchObject({ ok: false, status: 409, error: { code: "chat_closed" } });
    expect(
      await api.client.call(messageAllPassengersRoute, {
        accessToken: anna.accessToken,
        params: { id: sampleTrip.north },
        body: { clientId: randomUUID(), text: "Thanks, everyone" },
      }),
    ).toMatchObject({ ok: true, data: { sent: 0 } });
    expect(await canWriteTo(anna.accessToken, bookingId)).toBe(false);

    // Nor does the person write to those who cannot answer.
    const back = await api.signIn(await phoneOf(gunna));
    expect(
      await api.client.call(sendMessageRoute, {
        accessToken: back.accessToken,
        params: { id: bookingId },
        body: { clientId: randomUUID(), text: "Bye" },
      }),
    ).toMatchObject({ ok: false, status: 409, error: { code: "chat_closed" } });
    expect(await canWriteTo(back.accessToken, bookingId)).toBe(false);
  });

  it("signs in while it waits, and keeps the account as it was", async () => {
    const jon = await driverOf(sampleTrip.vik, "Jón");
    const deleted = await deleteAccount(jon, await freshCode(jon));
    if (!deleted.ok) throw new Error(deleted.error.code);

    const back = await api.signIn(await phoneOf(jon));
    expect(await me(back.accessToken)).toMatchObject({
      ok: true,
      data: { deletionScheduledFor: deleted.data.deleteAfter },
    });
    const kept = await api.client.call(cancelDeletionRoute, {
      accessToken: back.accessToken,
      body: {},
    });
    expect(kept).toMatchObject({ ok: true, status: 200, data: { deletionScheduledFor: null } });
    expect((await detailsOf(sampleTrip.vik)).ok).toBe(true);
  });

  it("keeps the first date when asked again while it waits", async () => {
    const jon = await driverOf(sampleTrip.vik, "Jón");
    const first = await deleteAccount(jon, await freshCode(jon));
    if (!first.ok) throw new Error(first.error.code);

    await later(hours(24));
    const { accessToken, refreshToken } = await api.signIn(await phoneOf(jon));
    const back = { ...jon, accessToken, refreshToken };
    const again = await deleteAccount(back, await freshCode(back));
    expect(again).toMatchObject({
      ok: true,
      status: 202,
      data: { deleteAfter: first.data.deleteAfter },
    });
    expect(await me((await api.signIn(await phoneOf(jon))).accessToken)).toMatchObject({
      ok: true,
      data: { deletionScheduledFor: first.data.deleteAfter },
    });
  });

  it("takes on nothing new while it waits: no booking, no trip published", async () => {
    const gunna = await newMember("Gunna");
    const jon = await driverOf(sampleTrip.vik, "Jón");
    for (const member of [gunna, jon]) {
      const deleted = await deleteAccount(member, await freshCode(member));
      expect(deleted).toMatchObject({ ok: true, status: 202 });
    }
    const pending = { ok: false, status: 403, error: { code: "account_deletion_pending" } };

    const passenger = await api.signIn(await phoneOf(gunna));
    expect(
      await book(passenger.accessToken, sampleTrip.north, { fromStop: 0, toStop: 3 }),
    ).toMatchObject(pending);

    const driver = await api.signIn(await phoneOf(jon));
    const draft = await api.client.call(createTripRoute, {
      accessToken: driver.accessToken,
      body: { stops: ["bsi", "borgarnes", "akureyri"].map((key) => sampleId(`point:${key}`)) },
    });
    if (!draft.ok) throw new Error(draft.error.code);
    expect(
      await api.client.call(publishTripRoute, {
        accessToken: driver.accessToken,
        params: { id: draft.data.id },
        body: {},
      }),
    ).toMatchObject(pending);
  });

  it("leaves a suspension in place when the account is kept", async () => {
    const gunna = await newMember("Gunna");
    const { db } = api.connection;
    await db
      .update(schema.users)
      .set({ status: "suspended", deleteAfter: new Date(api.now().getTime() + days(7) * 1000) })
      .where(eq(schema.users.id, gunna.userId));
    const deletion = createDeletionService({
      db,
      clock: () => api.now(),
      auth: { withConfirmCode: () => Promise.reject(new Error("Not used.")) },
      tripDaySettings: defaultTripDaySettings,
      logger: createLogger({ level: "silent" }),
    });

    await deletion.cancel(gunna.userId);
    const [row] = await db
      .select({ status: schema.users.status, deleteAfter: schema.users.deleteAfter })
      .from(schema.users)
      .where(eq(schema.users.id, gunna.userId));
    expect(row).toEqual({ status: "suspended", deleteAfter: null });
  });

  it("tells the person by email when the data will be erased, unless they kept it", async () => {
    const push = createFakePushSender();
    const email = createFakeEmailSender();
    const worker = createNotificationWorker({
      db: api.connection.db,
      clock: () => api.now(),
      push,
      email: { sender: email, webAppUrl: "https://shareride.test" },
    });
    const gunna = await newMember("Gunna");
    const address = `${randomUUID()}@example.test`;
    await api.connection.db
      .update(schema.users)
      .set({ email: address, emailVerifiedAt: api.now(), locale: "is" })
      .where(eq(schema.users.id, gunna.userId));

    expect(await deleteAccount(gunna, await freshCode(gunna))).toMatchObject({ ok: true });
    await worker.runOnce();
    expect(push.sent).toEqual([]);
    expect(email.sent).toHaveLength(1);
    const [mail] = email.sent;
    expect(mail?.to).toBe(address);
    expect(mail?.subject).toBe("PuffinRide aðganginum þínum verður eytt");
    expect(mail?.text).toMatch(/Gögnunum þínum verður eytt 20\. nóvember kl\. \d\d:\d\d\./);

    // Kept before the email went: none goes.
    const siggi = await newMember("Siggi");
    await api.connection.db
      .update(schema.users)
      .set({ email: `${randomUUID()}@example.test`, emailVerifiedAt: api.now() })
      .where(eq(schema.users.id, siggi.userId));
    expect(await deleteAccount(siggi, await freshCode(siggi))).toMatchObject({ ok: true });
    const back = await api.signIn(await phoneOf(siggi));
    await api.client.call(cancelDeletionRoute, { accessToken: back.accessToken, body: {} });
    await worker.runOnce();
    expect(email.sent).toHaveLength(1);
  });
});
