import { randomUUID } from "node:crypto";
import {
  acceptRequestRoute,
  bookTripRoute,
  declineRequestRoute,
  messageAllPassengersRoute,
  sendMessageRoute,
  withdrawRequestRoute,
  type SendMessageBody,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createFakeEmailSender, type FakeEmailSender } from "../../platform/email.ts";
import { createFakePushSender, type FakePushSender, type PushSender } from "../../platform/push.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";
import { expireAllDueBookings } from "../bookings/index.ts";
import { cleanUpNotifications } from "./clean-up.ts";
import { createNotificationWorker } from "./worker.ts";

// The sample trips at the test clock (Friday 13 November 2026, noon): Jón
// drives Hlemmur to Keflavík Airport on Saturday at 05:30 (instant, paid)
// and Anna drives BSÍ to Hof, Akureyri on Saturday at 09:00 (approval).

let api: TestApi;
let push: FakePushSender;
let email: FakeEmailSender;

const { airport, north } = sampleTrip;
const { outboxEvents, notifications, notificationDeliveries, scheduledNotifications } = schema;

beforeAll(async () => {
  api = await startTestApi();
  await seedForBookings(api);
});

beforeEach(async () => {
  await freshSampleTrips(api);
  await api.connection.db.execute(sql`delete from outbox_events`);
  await api.connection.db.execute(sql`delete from notifications`);
  await api.connection.db.execute(sql`delete from scheduled_notifications`);
  push = createFakePushSender();
  email = createFakeEmailSender();
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, later, rewind, driverOf, booked, paid } = bookingHelpers(() => api);

function worker(
  options: {
    email?: FakeEmailSender | null;
    push?: PushSender;
    onEventError?: (error: unknown, event: { id: string; givenUp: boolean }) => void;
  } = {},
) {
  const sender = options.email === undefined ? email : options.email;
  return createNotificationWorker({
    db: api.connection.db,
    clock: () => api.now(),
    push: options.push ?? push,
    ...(sender === null ? {} : { email: sender }),
    ...(options.onEventError === undefined ? {} : { onEventError: options.onEventError }),
  });
}

/**
 * Makes the database refuse to write rows of the table matching `when`
 * while `run` runs, as a bug or a lost connection would.
 */
async function refusing(table: string, when: string, run: () => Promise<void>) {
  const { db } = api.connection;
  await db.execute(
    sql.raw(
      "create or replace function refuse_for_test() returns trigger language plpgsql as $$ begin raise exception 'refused for the test'; end $$",
    ),
  );
  await db.execute(
    sql.raw(
      `create trigger refuse_for_test before insert or update on ${table} for each row when (${when}) execute function refuse_for_test()`,
    ),
  );
  try {
    await run();
  } finally {
    await db.execute(sql.raw(`drop trigger refuse_for_test on ${table}`));
  }
}

/** A push token on the member's newest session, as the app will register it (PR 6). */
async function withDevice(member: Member) {
  const { db } = api.connection;
  const [session] = await db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(eq(schema.sessions.userId, member.userId))
    .orderBy(desc(schema.sessions.createdAt))
    .limit(1);
  if (session === undefined) throw new Error("No session.");
  await db.insert(schema.pushTokens).values({
    sessionId: session.id,
    userId: member.userId,
    platform: "ios",
    token: `ExponentPushToken[${member.userId}]`,
  });
  return { sessionId: session.id, token: `ExponentPushToken[${member.userId}]` };
}

async function speaks(member: Member, locale: "is" | "en") {
  await api.connection.db
    .update(schema.users)
    .set({ locale })
    .where(eq(schema.users.id, member.userId));
}

async function withEmail(member: Member, address: string) {
  await api.connection.db
    .update(schema.users)
    .set({ email: address, emailVerifiedAt: api.now() })
    .where(eq(schema.users.id, member.userId));
}

async function events() {
  return api.connection.db
    .select({ kind: outboxEvents.kind, payload: outboxEvents.payload })
    .from(outboxEvents)
    .orderBy(asc(outboxEvents.createdAt), asc(outboxEvents.id));
}

/** Each notification of the member with its deliveries, as the log keeps them. */
async function logOf(member: Member) {
  const rows = await api.connection.db
    .select({
      kind: notifications.kind,
      channel: notificationDeliveries.channel,
      status: notificationDeliveries.status,
      reason: notificationDeliveries.reason,
      attempts: notificationDeliveries.attempts,
    })
    .from(notifications)
    .innerJoin(notificationDeliveries, eq(notificationDeliveries.notificationId, notifications.id))
    .where(eq(notifications.recipientId, member.userId))
    .orderBy(
      asc(notifications.createdAt),
      asc(notifications.id),
      asc(notificationDeliveries.channel),
    );
  return rows;
}

async function accept(driver: Member, bookingId: string) {
  const result = await api.client.call(acceptRequestRoute, {
    accessToken: driver.accessToken,
    params: { id: bookingId },
    body: {},
  });
  if (!result.ok) throw new Error(result.error.code);
}

async function send(member: Member, bookingId: string, body: Partial<SendMessageBody>) {
  const result = await api.client.call(sendMessageRoute, {
    accessToken: member.accessToken,
    params: { id: bookingId },
    body: { clientId: randomUUID(), ...body } as SendMessageBody,
  });
  if (!result.ok) throw new Error(`${String(result.status)} ${result.error.code}`);
  return result.data;
}

/** A driver and a passenger with a paid booking on the airport trip. */
async function confirmedBooking(passengerName = "Gunna", driver?: Member) {
  const jon = driver ?? (await driverOf(airport, "Jón"));
  const passenger = await newMember(passengerName);
  const booking = await booked(passenger.accessToken, airport, { fromStop: 0, toStop: 1 });
  await paid(passenger.accessToken, booking.id);
  return { jon, passenger, bookingId: booking.id };
}

describe("the outbox (spec 7, 3.7)", () => {
  it("gets an event in the same transaction as each change to a request", async () => {
    const anna = await driverOf(north);
    const jon = await newMember("Jón");
    const accepted = await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    await accept(anna, accepted.id);
    await paid(jon.accessToken, accepted.id);
    const gunna = await newMember("Gunna");
    const declined = await booked(gunna.accessToken, north, { fromStop: 1, toStop: 3 });
    await api.client.call(declineRequestRoute, {
      accessToken: anna.accessToken,
      params: { id: declined.id },
      body: { reason: "other" },
    });
    const withdrawn = await booked(gunna.accessToken, north, { fromStop: 2, toStop: 3 });
    await api.client.call(withdrawRequestRoute, {
      accessToken: gunna.accessToken,
      params: { id: withdrawn.id },
      body: {},
    });

    expect(await events()).toEqual([
      { kind: "BookingRequested", payload: { bookingId: accepted.id } },
      { kind: "BookingAccepted", payload: { bookingId: accepted.id } },
      { kind: "BookingConfirmed", payload: { bookingId: accepted.id } },
      { kind: "BookingRequested", payload: { bookingId: declined.id } },
      { kind: "BookingDeclined", payload: { bookingId: declined.id } },
      { kind: "BookingRequested", payload: { bookingId: withdrawn.id } },
      { kind: "BookingWithdrawn", payload: { bookingId: withdrawn.id } },
    ]);
  });

  it("gets BookingAccepted for an instant booking, and BookingExpired with the reason", async () => {
    await driverOf(north);
    const jon = await newMember("Jón");
    const unpaid = await booked(jon.accessToken, airport, { fromStop: 0, toStop: 1 });
    const gunna = await newMember("Gunna");
    const unanswered = await booked(gunna.accessToken, north, { fromStop: 0, toStop: 1 });
    await later(13 * 3600);
    await expireAllDueBookings(api.connection.db, api.now());

    const kinds = await events();
    expect(kinds.slice(0, 2)).toEqual([
      { kind: "BookingAccepted", payload: { bookingId: unpaid.id } },
      { kind: "BookingRequested", payload: { bookingId: unanswered.id } },
    ]);
    expect(kinds).toContainEqual({
      kind: "BookingExpired",
      payload: { bookingId: unpaid.id, reason: "unpaid" },
    });
    expect(kinds).toContainEqual({
      kind: "BookingExpired",
      payload: { bookingId: unanswered.id, reason: "unanswered" },
    });
  });

  it("gets nothing from a booking that is refused", async () => {
    const gunna = await newMember("Gunna");
    const refused = await api.client.call(bookTripRoute, {
      accessToken: gunna.accessToken,
      params: { id: north },
      body: {
        seats: 1,
        fromStop: 0,
        toStop: 1,
        total: { amount: 1, currency: "ISK" },
        message: "",
        attemptKey: randomUUID(),
      },
    });
    expect(refused.ok).toBe(false);
    expect(await events()).toEqual([]);
  });

  it("gets BookingConfirmed alone for a free booking, instant or accepted (R5.11)", async () => {
    await driverOf(airport, "Jón");
    const anna = await driverOf(north, "Anna");
    await api.connection.db
      .update(schema.segments)
      .set({ price: 0 })
      .where(inArray(schema.segments.tripId, [airport, north]));
    const gunna = await newMember("Gunna");
    const instant = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
    const dora = await newMember("Dóra");
    const request = await booked(dora.accessToken, north, { fromStop: 0, toStop: 1 });
    await accept(anna, request.id);

    expect(await events()).toEqual([
      { kind: "BookingConfirmed", payload: { bookingId: instant.id } },
      { kind: "BookingRequested", payload: { bookingId: request.id } },
      { kind: "BookingConfirmed", payload: { bookingId: request.id } },
    ]);
  });

  it("gets MessageSent with the message ID only, once per message, and once per passenger for a message to all", async () => {
    const { jon, passenger, bookingId } = await confirmedBooking();
    const other = await confirmedBooking("Dóra", jon);
    await api.connection.db.execute(sql`delete from outbox_events`);
    const clientId = randomUUID();
    const first = await send(passenger, bookingId, { clientId, text: "Where shall I wait?" });
    // A retry is the same message: no second event.
    await send(passenger, bookingId, { clientId, text: "Where shall I wait?" });
    const all = await api.client.call(messageAllPassengersRoute, {
      accessToken: jon.accessToken,
      params: { id: airport },
      body: { clientId: randomUUID(), quick: { key: "onMyWay" } },
    });
    expect(all).toMatchObject({ data: { sent: 2 } });

    const sent = await events();
    expect(sent).toHaveLength(3);
    expect(sent[0]).toEqual({ kind: "MessageSent", payload: { messageId: first.id } });
    expect(sent.every((event) => event.kind === "MessageSent")).toBe(true);
    expect(JSON.stringify(sent)).not.toMatch(/wait/);
    expect(other.bookingId).not.toBe(bookingId);
  });
});

describe("the worker (plan 4.4)", () => {
  it("turns an event into one notification per person, with a delivery per channel", async () => {
    const anna = await driverOf(north);
    await withDevice(anna);
    const jon = await newMember("Jón");
    const request = await booked(jon.accessToken, north, { fromStop: 0, toStop: 2, seats: 2 });

    expect(await worker().runOnce()).toMatchObject({ events: 1, sent: 1 });
    expect(await logOf(anna)).toEqual([
      { kind: "request_new", channel: "email", status: "skipped", reason: "has_push", attempts: 0 },
      { kind: "request_new", channel: "push", status: "sent", reason: null, attempts: 1 },
    ]);
    expect(push.sent).toEqual([
      {
        to: `ExponentPushToken[${anna.userId}]`,
        title: "New request: Jón",
        body: expect.stringMatching(
          /^2 seats · BSÍ bus terminal – Olís Blönduós · Saturday 14 November at \d\d:\d\d$/,
        ) as unknown,
        data: { path: `/drive/trips/${north}` },
      },
    ]);
    expect(await logOf(jon)).toEqual([]);
    expect(request.status).toBe("requested");
  });

  it("puts it into words in the person's language and local time (R7.7)", async () => {
    const anna = await driverOf(north);
    await speaks(anna, "is");
    await withDevice(anna);
    const jon = await newMember("Jón");
    await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    await worker().runOnce();
    expect(push.sent).toMatchObject([
      {
        title: "Ný beiðni: Jón",
        body: "1 sæti · BSÍ – N1 Borgarnesi · laugardagur 14. nóvember kl. 09:00",
      },
    ]);
  });

  it("records a channel it cannot use as skipped, with the reason", async () => {
    const anna = await driverOf(north);
    const jon = await newMember("Jón");
    const request = await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    await accept(anna, request.id);
    await worker().runOnce();
    // Jón has no device and no email: "Pay now" goes nowhere, and the log says why.
    expect(await logOf(jon)).toEqual([
      { kind: "pay_now", channel: "email", status: "skipped", reason: "no_email", attempts: 0 },
      { kind: "pay_now", channel: "push", status: "skipped", reason: "no_device", attempts: 0 },
    ]);
    // Without push, the request's email is the fallback; with no address, skipped too.
    expect(await logOf(anna)).toEqual([
      { kind: "request_new", channel: "email", status: "skipped", reason: "no_email", attempts: 0 },
      { kind: "request_new", channel: "push", status: "skipped", reason: "no_device", attempts: 0 },
    ]);
    expect(push.sent).toEqual([]);
  });

  it("sends the email when there is a verified address, and skips it while no email provider is set up", async () => {
    const anna = await driverOf(north);
    await withEmail(anna, "anna@example.com");
    const jon = await newMember("Jón");
    await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    await worker().runOnce();
    expect(await logOf(anna)).toMatchObject([
      { kind: "request_new", channel: "email", status: "sent", attempts: 1 },
      { kind: "request_new", channel: "push", status: "skipped", reason: "no_device" },
    ]);
    expect(email.sent).toEqual([
      {
        to: "anna@example.com",
        subject: "New request: Jón",
        text: expect.stringMatching(
          /^1 seat · BSÍ bus terminal – N1 Borgarnes · Saturday/,
        ) as unknown,
        idempotencyKey: expect.any(String) as unknown,
      },
    ]);

    const gunna = await newMember("Gunna");
    await booked(gunna.accessToken, north, { fromStop: 1, toStop: 2 });
    await worker({ email: null }).runOnce();
    expect((await logOf(anna)).slice(2)).toMatchObject([
      { kind: "request_new", channel: "email", status: "skipped", reason: "email_off" },
      { kind: "request_new", channel: "push", status: "skipped", reason: "no_device" },
    ]);
  });

  it("never sends to the token of a session that has ended", async () => {
    const anna = await driverOf(north);
    const device = await withDevice(anna);
    await api.connection.db
      .update(schema.sessions)
      .set({ endedAt: api.now(), endReason: "signed_out" })
      .where(eq(schema.sessions.id, device.sessionId));
    const jon = await newMember("Jón");
    await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    await worker().runOnce();
    expect(await logOf(anna)).toMatchObject([
      { channel: "email", reason: "no_email" },
      { channel: "push", status: "skipped", reason: "no_device" },
    ]);
    expect(push.sent).toEqual([]);
  });

  it("tells both people when a booking is confirmed, and the driver when it is paid for", async () => {
    const { jon, passenger, bookingId } = await confirmedBooking();
    await withDevice(jon);
    await withDevice(passenger);
    await worker().runOnce();
    expect((await logOf(passenger)).map((row) => `${row.kind} ${row.channel}`)).toEqual([
      "pay_now email",
      "pay_now push",
      "booking_confirmed email",
      "booking_confirmed push",
    ]);
    expect((await logOf(jon)).map((row) => row.kind)).toEqual([
      "booking_confirmed_driver",
      "booking_confirmed_driver",
    ]);
    // Paid before the worker came to it, so "Pay now" no longer applies.
    expect(await logOf(passenger)).toContainEqual(
      expect.objectContaining({ kind: "pay_now", channel: "push", reason: "no_longer_applies" }),
    );
    expect(push.sent.map((message) => [message.title, message.data.path])).toEqual([
      ["Booking confirmed", `/bookings/${bookingId}`],
      ["Booking confirmed: Gunna", `/drive/trips/${airport}`],
    ]);
  });

  it("pushes a chat message with its text, and a quick message in the reader's language", async () => {
    const { jon, passenger, bookingId } = await confirmedBooking();
    await speaks(passenger, "is");
    await withDevice(jon);
    await withDevice(passenger);
    await worker().runOnce();
    push.sent.length = 0;
    await send(passenger, bookingId, { text: "Hvar á ég að bíða?" });
    await send(jon, bookingId, { quick: { key: "atPoint" } });
    await worker().runOnce();
    expect(push.sent).toEqual([
      {
        to: `ExponentPushToken[${jon.userId}]`,
        title: "Gunna",
        body: "Hvar á ég að bíða?",
        data: { path: `/messages/${bookingId}` },
      },
      {
        to: `ExponentPushToken[${passenger.userId}]`,
        title: "Jón",
        body: "Ég er á mótsstaðnum",
        data: { path: `/messages/${bookingId}` },
      },
    ]);
    // Never by email (R7.9).
    expect((await logOf(jon)).filter((row) => row.kind === "new_message")).toEqual([
      { kind: "new_message", channel: "push", status: "sent", reason: null, attempts: 1 },
    ]);
  });

  it("gives one notification per person and channel when events are processed twice, or by two workers at once (R7.6)", async () => {
    const anna = await driverOf(north);
    await withDevice(anna);
    for (const name of ["Jón", "Gunna", "Dóra"]) {
      const member = await newMember(name);
      await booked(member.accessToken, north, { fromStop: 0, toStop: 1 });
    }
    await Promise.all([worker().runOnce(), worker().runOnce(), worker().runOnce()]);
    // As if the events had never been marked processed.
    await api.connection.db.update(outboxEvents).set({ processedAt: null });
    await Promise.all([worker().runOnce(), worker().runOnce()]);

    expect((await logOf(anna)).filter((row) => row.channel === "push")).toHaveLength(3);
    expect(push.sent).toHaveLength(3);
    expect(new Set(push.sent.map((message) => message.title)).size).toBe(3);
  });

  it("tries a failed send again, waiting twice as long each time, then marks it failed after an hour", async () => {
    const anna = await driverOf(north);
    await withDevice(anna);
    const jon = await newMember("Jón");
    await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    push.failure = new Error("The push service is down.");
    const waits: number[] = [];
    for (let attempt = 0; attempt < 10; attempt++) {
      await worker().runOnce();
      const [delivery] = await api.connection.db
        .select()
        .from(notificationDeliveries)
        .where(eq(notificationDeliveries.channel, "push"));
      if (delivery === undefined || delivery.nextAttemptAt === null) break;
      const wait = Math.round((delivery.nextAttemptAt.getTime() - api.now().getTime()) / 1000);
      waits.push(wait);
      await later(wait);
    }
    expect(waits).toEqual([30, 60, 120, 240, 480, 960]);
    expect(await logOf(anna)).toContainEqual({
      kind: "request_new",
      channel: "push",
      status: "failed",
      reason: "send_failed",
      attempts: 7,
    });
    expect(push.attempts).toBe(7);
  });

  it("sends once when a retry succeeds", async () => {
    const anna = await driverOf(north);
    await withDevice(anna);
    const jon = await newMember("Jón");
    await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    push.failure = new Error("The push service is down.");
    await worker().runOnce();
    push.failure = null;
    await later(30);
    await worker().runOnce();
    await later(3600);
    await worker().runOnce();
    expect(push.sent).toHaveLength(1);
    expect(await logOf(anna)).toContainEqual(
      expect.objectContaining({ channel: "push", status: "sent", attempts: 2 }),
    );
  });

  it("keeps going past an event it cannot handle, and gives it up after 5 tries", async () => {
    const anna = await driverOf(north);
    await withDevice(anna);
    const jon = await newMember("Jón");
    const stuck = await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    const gunna = await newMember("Gunna");
    await booked(gunna.accessToken, north, { fromStop: 1, toStop: 2 });
    const reported: { id: string; givenUp: boolean }[] = [];
    const onEventError = (_error: unknown, event: { id: string; givenUp: boolean }) => {
      reported.push(event);
    };
    await refusing("notifications", `new.booking_id = '${stuck.id}'`, async () => {
      for (let run = 0; run < 6; run++) await worker({ onEventError }).runOnce();
    });

    expect(push.sent.map((message) => message.title)).toEqual(["New request: Gunna"]);
    const [event] = await api.connection.db
      .select()
      .from(outboxEvents)
      .where(sql`${outboxEvents.payload} ->> 'bookingId' = ${stuck.id}`);
    expect(event).toMatchObject({
      attempts: 5,
      processedAt: expect.any(Date) as unknown,
      failedAt: expect.any(Date) as unknown,
    });
    expect(reported.map((report) => report.givenUp)).toEqual([false, false, false, false, true]);
    expect(new Set(reported.map((report) => report.id))).toEqual(new Set([event?.id]));
  });

  it("tells nobody about an event whose booking or message is gone, a chat's first line, or IDs that are not IDs", async () => {
    const { jon, passenger, bookingId } = await confirmedBooking();
    await withDevice(jon);
    await withDevice(passenger);
    await worker().runOnce();
    push.sent.length = 0;
    const { db } = api.connection;
    const [opened] = await db
      .select({ id: schema.messages.id })
      .from(schema.messages)
      .innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
      .where(and(eq(schema.conversations.bookingId, bookingId), isNull(schema.messages.senderId)));
    if (opened === undefined) throw new Error("No first line.");
    const odd: { kind: string; payload: Record<string, string> }[] = [
      { kind: "MessageSent", payload: { messageId: opened.id } },
      { kind: "MessageSent", payload: { messageId: randomUUID() } },
      { kind: "BookingConfirmed", payload: { bookingId: randomUUID() } },
      { kind: "BookingConfirmed", payload: { bookingId: "not-an-id" } },
      { kind: "MessageSent", payload: { messageId: "42" } },
    ];
    await db
      .insert(outboxEvents)
      .values(odd.map((event) => ({ ...event, createdAt: api.now(), updatedAt: api.now() })));

    expect(await worker().runOnce()).toMatchObject({ events: 5, sent: 0 });
    expect(push.sent).toEqual([]);
    expect(
      await db
        .select({ attempts: outboxEvents.attempts, failedAt: outboxEvents.failedAt })
        .from(outboxEvents)
        .where(isNull(outboxEvents.processedAt)),
    ).toEqual([]);
    expect(
      (await db.select().from(outboxEvents)).every(
        (event) => event.attempts === 0 && event.failedAt === null,
      ),
    ).toBe(true);
  });

  it("still sends what is due when the events cannot be taken", async () => {
    const anna = await driverOf(north);
    await withDevice(anna);
    const jon = await newMember("Jón");
    await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    push.failure = new Error("The push service is down.");
    await worker().runOnce();
    push.failure = null;
    const gunna = await newMember("Gunna");
    await booked(gunna.accessToken, north, { fromStop: 1, toStop: 2 });
    await later(30);
    await refusing("outbox_events", "new.processed_at is not null", async () => {
      await expect(worker().runOnce()).rejects.toThrow();
    });
    expect(push.sent.map((message) => message.title)).toEqual(["New request: Jón"]);
    await worker().runOnce();
    expect(push.sent.map((message) => message.title)).toEqual([
      "New request: Jón",
      "New request: Gunna",
    ]);
  });

  it("never sends a push again when storing that it was sent fails (R7.6)", async () => {
    const anna = await driverOf(north);
    await withDevice(anna);
    const jon = await newMember("Jón");
    await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    await refusing("notification_deliveries", "new.status = 'sent'", async () => {
      await expect(worker().runOnce()).rejects.toThrow();
    });
    expect(push.sent).toHaveLength(1);
    await later(30);
    await worker().runOnce();
    await later(121);
    await worker().runOnce();
    expect(push.sent).toHaveLength(1);
    expect(await logOf(anna)).toContainEqual({
      kind: "request_new",
      channel: "push",
      status: "failed",
      reason: "interrupted",
      attempts: 1,
    });
  });

  it("keeps what the sweep decided for a send that outlived its lease and failed, and records one that went through", async () => {
    const anna = await driverOf(north);
    await withDevice(anna);
    const jon = await newMember("Jón");
    await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    // While the send hangs, its lease runs out and another instance sweeps.
    const hanging = (outcome: "fails" | "succeeds"): PushSender => ({
      async send(messages) {
        await later(121);
        await worker().runOnce();
        if (outcome === "fails") throw new Error("Timed out.");
        return messages.map((_, index) => ({ status: "ok", id: `late-${String(index)}` }));
      },
    });
    await worker({ push: hanging("fails") }).runOnce();
    await later(3600);
    await worker().runOnce();
    expect(await logOf(anna)).toContainEqual({
      kind: "request_new",
      channel: "push",
      status: "failed",
      reason: "interrupted",
      attempts: 1,
    });

    const gunna = await newMember("Gunna");
    await booked(gunna.accessToken, north, { fromStop: 1, toStop: 2 });
    await worker({ push: hanging("succeeds") }).runOnce();
    expect((await logOf(anna)).slice(2)).toContainEqual({
      kind: "request_new",
      channel: "push",
      status: "sent",
      reason: null,
      attempts: 1,
    });
    expect(push.sent).toEqual([]);
  });

  it("does not send a request or payment notification once the booking has moved on, even on a retry", async () => {
    const anna = await driverOf(north);
    await withDevice(anna);
    const jon = await newMember("Jón");
    const request = await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    await withDevice(gunna);
    const booking = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
    push.failure = new Error("The push service is down.");
    await worker().runOnce();
    await api.client.call(declineRequestRoute, {
      accessToken: anna.accessToken,
      params: { id: request.id },
      body: { reason: "other" },
    });
    await paid(gunna.accessToken, booking.id);
    push.failure = null;
    await later(30);
    await worker().runOnce();

    expect(push.sent.map((message) => message.title)).toEqual(["Booking confirmed"]);
    expect(await logOf(anna)).toContainEqual({
      kind: "request_new",
      channel: "push",
      status: "skipped",
      reason: "no_longer_applies",
      attempts: 2,
    });
    expect(await logOf(gunna)).toContainEqual({
      kind: "pay_now",
      channel: "push",
      status: "skipped",
      reason: "no_longer_applies",
      attempts: 2,
    });
  });

  it("marks a send cut off by a restart failed, and never sends it again", async () => {
    const anna = await driverOf(north);
    await withDevice(anna);
    const jon = await newMember("Jón");
    await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    await worker().runOnce();
    // As if a worker had claimed it and stopped before the send's result was stored.
    await api.connection.db
      .update(notificationDeliveries)
      .set({
        status: "sending",
        sentAt: null,
        nextAttemptAt: new Date(api.now().getTime() + 120_000),
      })
      .where(eq(notificationDeliveries.channel, "push"));
    push.sent.length = 0;
    await worker().runOnce();
    expect(push.sent).toEqual([]);
    await later(121);
    await worker().runOnce();
    expect(push.sent).toEqual([]);
    expect(await logOf(anna)).toContainEqual(
      expect.objectContaining({ channel: "push", status: "failed", reason: "interrupted" }),
    );
  });
});

describe("notifications that wait for a moment (spec 7, 3.3)", () => {
  it("reminds the driver of an unanswered request halfway to its deadline, once", async () => {
    const anna = await driverOf(north);
    await withDevice(anna);
    const jon = await newMember("Jón");
    const request = await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    await worker().runOnce();
    const expiresAt = new Date(request.requestExpiresAt ?? "");
    const requestedAt = api.now().getTime();
    const halfway = (expiresAt.getTime() - requestedAt) / 2000;
    await later(halfway - 60);
    await worker().runOnce();
    expect(push.sent.map((message) => message.title)).toEqual(["New request: Jón"]);
    await later(60);
    await worker().runOnce();
    await later(60);
    await worker().runOnce();
    expect(push.sent.map((message) => message.title)).toEqual([
      "New request: Jón",
      "Request still waiting: Jón",
    ]);
    expect(push.sent[1]?.body).toMatch(
      /^Answer by Saturday 14 November at \d\d:\d\d, or it expires\.$/,
    );
  });

  it("drops the halfway reminder once the request is answered", async () => {
    const anna = await driverOf(north);
    await withDevice(anna);
    const jon = await newMember("Jón");
    const request = await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    await worker().runOnce();
    await later(3600, anna);
    await api.client.call(declineRequestRoute, {
      accessToken: anna.accessToken,
      params: { id: request.id },
      body: { reason: "other" },
    });
    await later(12 * 3600);
    await worker().runOnce();
    expect(push.sent.map((message) => message.title)).toEqual(["New request: Jón"]);
    const [schedule] = await api.connection.db.select().from(scheduledNotifications);
    expect(schedule).toMatchObject({
      kind: "request_halfway",
      doneAt: expect.any(Date) as unknown,
    });
  });

  it("reminds the passenger 10 minutes before the payment deadline, unless paid", async () => {
    await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    await withDevice(gunna);
    const unpaid = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
    const dora = await newMember("Dóra");
    await withDevice(dora);
    const paidFor = await booked(dora.accessToken, airport, { fromStop: 1, toStop: 2 });
    await paid(dora.accessToken, paidFor.id);
    await worker().runOnce();
    await later(20 * 60);
    await worker().runOnce();
    const titles = push.sent.map(
      (message) =>
        `${message.to === `ExponentPushToken[${gunna.userId}]` ? "Gunna" : "Dóra"}: ${message.title}`,
    );
    // Dóra paid before the worker came to her "Pay now", so it was not sent.
    expect(titles).toEqual([
      "Gunna: Pay now: Hlemmur – Fjörður shopping centre",
      "Dóra: Booking confirmed",
      "Gunna: 10 minutes left to pay",
    ]);
    expect(unpaid.status).toBe("accepted");
  });
});

describe("clean-up (privacy register: notification log)", () => {
  it("deletes notifications after 90 days and processed events after 7", async () => {
    const anna = await driverOf(north);
    const jon = await newMember("Jón");
    await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    await worker().runOnce();
    const gunna = await newMember("Gunna");
    await booked(gunna.accessToken, north, { fromStop: 1, toStop: 2 });
    const count = async () => ({
      events: (await api.connection.db.select().from(outboxEvents)).length,
      notifications: (await logOf(anna)).length / 2,
    });

    const day = 24 * 3600 * 1000;
    expect(
      await cleanUpNotifications(
        api.connection.db,
        new Date(api.now().getTime() + 7 * day - 60_000),
      ),
    ).toEqual({ events: 0, notifications: 0, schedules: 0 });
    expect(
      await cleanUpNotifications(api.connection.db, new Date(api.now().getTime() + 8 * day)),
    ).toEqual({ events: 1, notifications: 0, schedules: 0 });
    // The event not yet processed stays, whatever its age.
    expect(await count()).toEqual({ events: 1, notifications: 1 });
    expect(
      await cleanUpNotifications(api.connection.db, new Date(api.now().getTime() + 91 * day)),
    ).toMatchObject({ notifications: 1 });
    expect(await count()).toEqual({ events: 1, notifications: 0 });
    expect(
      await api.connection.db
        .select()
        .from(notificationDeliveries)
        .where(eq(notificationDeliveries.channel, "push")),
    ).toEqual([]);
  });
});
