import { randomUUID } from "node:crypto";
import {
  acceptRequestRoute,
  bookTripRoute,
  cancelBookingRoute,
  cancellationPreviewRoute,
  cancelTripRoute,
  declineRequestRoute,
  messageAllPassengersRoute,
  readMessagesRoute,
  sendMessageRoute,
  setPushTokenRoute,
  withdrawRequestRoute,
  type CancelTripBody,
  type SendMessageBody,
} from "@shareride/contracts";
import { schema } from "@shareride/db";
import { formatMoney } from "@shareride/i18n";
import { and, asc, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createFakeEmailSender,
  EmailMaybeSent,
  type FakeEmailSender,
} from "../../platform/email.ts";
import {
  PushMaybeSent,
  createFakePushSender,
  type FakePushSender,
  type PushSender,
} from "../../platform/push.ts";
import {
  createDevSmsSender,
  SmsMaybeSent,
  SmsSendError,
  type DevSmsSender,
  type SmsSender,
} from "../../platform/sms.ts";
import { startTestApi, type TestApi } from "../../testing.ts";
import {
  bookingHelpers,
  freshSampleTrips,
  hours,
  sampleTrip,
  seedForBookings,
  type Member,
} from "../bookings/testing.ts";
import { expireAllDueBookings } from "../bookings/index.ts";
import { createPaymentService } from "../payments/service.ts";
import { cleanUpNotifications } from "./clean-up.ts";
import { setPreferences } from "./preferences.ts";
import { createNotificationWorker } from "./worker.ts";

// The sample trips at the test clock (Friday 13 November 2026, noon): Jón
// drives Hlemmur to Keflavík Airport on Saturday at 05:30 (instant, paid)
// and Anna drives BSÍ to Hof, Akureyri on Saturday at 09:00 (approval).

let api: TestApi;
let push: FakePushSender;
let email: FakeEmailSender;
let sms: DevSmsSender;

const { airport, north, vik } = sampleTrip;
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
  await api.connection.db.execute(sql`delete from push_tokens`);
  push = createFakePushSender();
  email = createFakeEmailSender();
  sms = createDevSmsSender({ print: () => undefined });
});

afterEach(() => {
  rewind();
});

afterAll(async () => {
  await api.close();
});

const { newMember, later, rewind, driverOf, booked, paid } = bookingHelpers(() => api);

/** Where links in emails lead in these tests. */
const webAppUrl = "https://shareride.test";

function worker(
  options: {
    email?: FakeEmailSender | null;
    push?: PushSender;
    sms?: SmsSender | null;
    onEventError?: (error: unknown, event: { id: string; givenUp: boolean }) => void;
  } = {},
) {
  const sender = options.email === undefined ? email : options.email;
  return createNotificationWorker({
    db: api.connection.db,
    clock: () => api.now(),
    push: options.push ?? push,
    ...(sender === null ? {} : { email: { sender, webAppUrl } }),
    ...(options.sms === null ? {} : { sms: options.sms ?? sms }),
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

/** Cancels the passenger's booking with the terms the preview shows, as the app does. */
async function cancelAsShown(passenger: Member, bookingId: string) {
  const preview = await api.client.call(cancellationPreviewRoute, {
    accessToken: passenger.accessToken,
    params: { id: bookingId },
  });
  if (!preview.ok) throw new Error(preview.error.code);
  const [{ reason, refund, countsOnReliability }] = preview.data.reasons as [
    (typeof preview.data.reasons)[number],
  ];
  const result = await api.client.call(cancelBookingRoute, {
    accessToken: passenger.accessToken,
    params: { id: bookingId },
    body: { reason, terms: { refund, countsOnReliability } },
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.data;
}

/** The driver cancels the booking for the reason, with the terms the preview shows. */
async function cancelAsDriver(driver: Member, bookingId: string, reason = "car_problem") {
  const preview = await api.client.call(cancellationPreviewRoute, {
    accessToken: driver.accessToken,
    params: { id: bookingId },
  });
  if (!preview.ok) throw new Error(preview.error.code);
  const shown = preview.data.reasons.find((option) => option.reason === reason);
  if (shown === undefined) throw new Error(`${reason} is not offered`);
  const result = await api.client.call(cancelBookingRoute, {
    accessToken: driver.accessToken,
    params: { id: bookingId },
    body: {
      reason: shown.reason,
      note: "Call me if you need help.",
      terms: { refund: shown.refund, countsOnReliability: shown.countsOnReliability },
    },
  });
  if (!result.ok) throw new Error(result.error.code);
  return result.data;
}

/**
 * As if `count` SMS had gone to the member since midnight (R7.10), the
 * last `interrupted` of them with their answer lost, so they may have gone.
 */
async function smsSentToday(member: Member, count: number, interrupted = 0) {
  const { db } = api.connection;
  for (let index = 0; index < count; index += 1) {
    const lost = index >= count - interrupted;
    const [notification] = await db
      .insert(notifications)
      .values({
        recipientId: member.userId,
        kind: "meeting_point_changed",
        uniqueKey: `test:${member.userId}:${String(index)}`,
        createdAt: api.now(),
        updatedAt: api.now(),
      })
      .returning({ id: notifications.id });
    if (notification === undefined) throw new Error("not stored");
    await db.insert(notificationDeliveries).values({
      notificationId: notification.id,
      channel: "sms",
      ...(lost ? { status: "failed", reason: "interrupted" } : { status: "sent" }),
      attempts: 1,
      createdAt: api.now(),
      updatedAt: api.now(),
    });
  }
}

/** The member's verified phone number, where their SMS goes. */
async function phoneOf(member: Member) {
  const [user] = await api.connection.db
    .select({ phone: schema.users.phoneE164 })
    .from(schema.users)
    .where(eq(schema.users.id, member.userId));
  return user?.phone;
}

/**
 * The driver cancels the whole trip (spec 6, 3.3), with someone on it who
 * paid, and a note that never leaves the app.
 */
async function cancelTripAs(driver: Member, tripId: string, reason: CancelTripBody["reason"]) {
  const result = await api.client.call(cancelTripRoute, {
    accessToken: driver.accessToken,
    params: { id: tripId },
    body: {
      reason,
      note: "Sorry, the snow came early.",
      countsOnReliability: reason !== "weather" && reason !== "road_closed",
    },
  });
  if (!result.ok) throw new Error(result.error.code);
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
        html: expect.stringContaining(
          "<p>1 seat · BSÍ bus terminal – N1 Borgarnes · Saturday",
        ) as unknown,
        idempotencyKey: expect.any(String) as unknown,
      },
    ]);
    // A plain link to the trip, in both parts (plan 4.6).
    expect(email.sent[0]?.text).toContain(`Open in ShareRide: ${webAppUrl}/drive/trips/${north}`);
    expect(email.sent[0]?.html).toContain(`<a href="${webAppUrl}/drive/trips/${north}">`);

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

  it("tells the driver when the passenger cancels, and the passenger by email once the refund is made", async () => {
    const { jon, passenger, bookingId } = await confirmedBooking();
    await withDevice(jon);
    await withDevice(passenger);
    await withEmail(passenger, "gunna@example.com");
    await worker().runOnce();
    const pushedBefore = push.sent.length;

    const { cancellation } = await cancelAsShown(passenger, bookingId);
    if (cancellation === null) throw new Error("not cancelled");
    expect(cancellation.refund.amount).toBeGreaterThan(0);
    await worker().runOnce();
    expect(push.sent.slice(pushedBefore)).toEqual([
      {
        to: `ExponentPushToken[${jon.userId}]`,
        title: "Booking cancelled: Gunna",
        body: "1 seat · Hlemmur – Fjörður shopping centre · Saturday 14 November at 05:30",
        data: { path: `/drive/trips/${airport}` },
      },
    ]);
    expect((await logOf(passenger)).map((row) => row.kind)).not.toContain("refund_issued");

    const payments = createPaymentService({
      db: api.connection.db,
      clock: () => api.now(),
      provider: api.features.payments,
    });
    await payments.refundOwed();
    await worker().runOnce();
    expect((await logOf(passenger)).filter((row) => row.kind === "refund_issued")).toEqual([
      { kind: "refund_issued", channel: "email", status: "sent", reason: null, attempts: 1 },
    ]);
    expect(email.sent.at(-1)).toMatchObject({
      to: "gunna@example.com",
      subject: `Refund of ${formatMoney(cancellation.refund, "en")}`,
      text: expect.stringMatching(
        /^Hlemmur – Fjörður shopping centre · Saturday 14 November at 05:30\. It goes back to the card you paid with\./,
      ) as unknown,
    });
    expect(push.sent.slice(pushedBefore)).toHaveLength(1);
  });

  it("tells the passenger when the driver cancels, by SMS too within 24 hours of boarding (spec 7, 3.4)", async () => {
    const { jon, passenger, bookingId } = await confirmedBooking();
    await withDevice(passenger);
    await worker().runOnce();
    push.sent.length = 0;

    const cancelled = await cancelAsDriver(jon, bookingId);
    const refund = formatMoney(cancelled.total, "en");
    await worker().runOnce();
    expect(push.sent).toEqual([
      {
        to: `ExponentPushToken[${passenger.userId}]`,
        title: "The driver cancelled: Car problem",
        body: `Hlemmur – Fjörður shopping centre · Saturday 14 November at 05:30. Full refund of ${refund}.`,
        data: { path: `/bookings/${bookingId}` },
      },
    ]);
    // Boarding is Saturday 05:30, under 24 hours away; the note is never in it (R7.9).
    expect(sms.outbox).toEqual([
      {
        to: await phoneOf(passenger),
        text: "ShareRide: the driver cancelled your booking for Saturday 14 November at 05:30. Full refund. Details in the app.",
      },
    ]);
    expect(
      (await logOf(passenger)).filter((row) => row.kind === "booking_cancelled_by_driver"),
    ).toEqual([
      {
        kind: "booking_cancelled_by_driver",
        channel: "email",
        status: "skipped",
        reason: "no_email",
        attempts: 0,
      },
      {
        kind: "booking_cancelled_by_driver",
        channel: "push",
        status: "sent",
        reason: null,
        attempts: 1,
      },
      {
        kind: "booking_cancelled_by_driver",
        channel: "sms",
        status: "sent",
        reason: null,
        attempts: 1,
      },
    ]);
  });

  it("sends no SMS for an unpaid booking's refund, more than 24 hours ahead, or past 5 a day (R7.10)", async () => {
    // Unpaid, in the window: the SMS says nothing of a refund.
    const jon = await driverOf(airport, "Jón");
    const gunna = await newMember("Gunna");
    await speaks(gunna, "is");
    const unpaid = await booked(gunna.accessToken, airport, { fromStop: 0, toStop: 1 });
    await cancelAsDriver(jon, unpaid.id, "illness");
    await worker().runOnce();
    expect(sms.outbox.map((message) => message.text)).toEqual([
      "ShareRide: Bílstjórinn aflýsti bókun þinni: laugardagur 14. nóvember kl. 05:30. Nánar í appinu.",
    ]);

    // Two days ahead: outside the window.
    const vikDriver = await driverOf(vik, "Sigga");
    const dora = await newMember("Dóra");
    const far = await booked(dora.accessToken, vik, { fromStop: 0, toStop: 1 });
    await paid(dora.accessToken, far.id);
    await cancelAsDriver(vikDriver, far.id);
    await worker().runOnce();
    expect(await logOf(dora)).toContainEqual({
      kind: "booking_cancelled_by_driver",
      channel: "sms",
      status: "skipped",
      reason: "outside_sms_window",
      attempts: 0,
    });

    // Five already today, one of them lost on its way: the sixth waits for the app and email.
    const { passenger: oli, bookingId } = await confirmedBooking("Óli", jon);
    await smsSentToday(oli, 5, 1);
    await cancelAsDriver(jon, bookingId);
    await worker().runOnce();
    expect(await logOf(oli)).toContainEqual({
      kind: "booking_cancelled_by_driver",
      channel: "sms",
      status: "skipped",
      reason: "sms_limit",
      attempts: 0,
    });
    expect(sms.outbox).toHaveLength(1);
  });

  it("never sends an SMS twice when its answer was lost, and tries again when it never left", async () => {
    const { jon, passenger, bookingId } = await confirmedBooking();
    let tries = 0;
    const lost: SmsSender = {
      send: () => {
        tries += 1;
        return Promise.reject(
          new SmsMaybeSent("Vonage did not answer in time", {
            cause: new DOMException("The operation timed out.", "TimeoutError"),
          }),
        );
      },
    };
    await cancelAsDriver(jon, bookingId);
    await worker({ sms: lost }).runOnce();
    await later(hours(1), jon, passenger);
    await worker({ sms: lost }).runOnce();
    expect(tries).toBe(1);
    expect((await logOf(passenger)).find((row) => row.channel === "sms")).toMatchObject({
      status: "failed",
      reason: "interrupted",
    });

    const refused: SmsSender = {
      send: () => Promise.reject(new SmsSendError("Vonage refused the message (HTTP 401)")),
    };
    const { passenger: dora, bookingId: second } = await confirmedBooking("Dóra", jon);
    await cancelAsDriver(jon, second);
    await worker({ sms: refused }).runOnce();
    expect((await logOf(dora)).find((row) => row.channel === "sms")).toMatchObject({
      status: "queued",
      attempts: 1,
    });
    await later(hours(1), jon, dora);
    await worker().runOnce();
    expect(sms.outbox.at(-1)?.to).toBe(await phoneOf(dora));
  });

  it("tells everyone on a cancelled trip at once, by SMS too within 24 hours, never with the note (spec 6, 3.3)", async () => {
    const anna = await driverOf(north);
    const gunna = await newMember("Gunna");
    const confirmed = await booked(gunna.accessToken, north, { fromStop: 0, toStop: 3 });
    await accept(anna, confirmed.id);
    await paid(gunna.accessToken, confirmed.id);
    await withEmail(gunna, "gunna-trip@example.com");
    const oli = await newMember("Óli");
    await speaks(oli, "is");
    const request = await booked(oli.accessToken, north, { fromStop: 0, toStop: 1 });
    for (const member of [anna, gunna, oli]) await withDevice(member);
    await worker().runOnce();
    push.sent.length = 0;

    await cancelTripAs(anna, north, "weather");
    await worker().runOnce();
    // Saturday 09:00 is under 24 hours away. The driver is told nothing: it was their own doing.
    expect(push.sent).toHaveLength(2);
    expect(push.sent).toEqual(
      expect.arrayContaining([
        {
          to: `ExponentPushToken[${gunna.userId}]`,
          title: "Trip cancelled: Weather",
          body: `BSÍ bus terminal – Hof bus stop, Akureyri · Saturday 14 November at 09:00. Full refund of ${formatMoney(confirmed.total, "en")}.`,
          data: { path: `/bookings/${confirmed.id}` },
        },
        {
          to: `ExponentPushToken[${oli.userId}]`,
          title: "Ferð aflýst: Veður",
          body: "BSÍ – N1 Borgarnesi · laugardagur 14. nóvember kl. 09:00. Leitaðu að annarri ferð.",
          data: { path: `/bookings/${request.id}` },
        },
      ]),
    );
    expect(sms.outbox).toHaveLength(2);
    expect(sms.outbox).toEqual(
      expect.arrayContaining([
        {
          to: await phoneOf(gunna),
          text: "ShareRide: your trip on Saturday 14 November at 09:00 is cancelled. Full refund. Details in the app.",
        },
        {
          to: await phoneOf(oli),
          text: "ShareRide: Ferðinni þinni var aflýst: laugardagur 14. nóvember kl. 09:00. Nánar í appinu.",
        },
      ]),
    );
    expect(email.sent.at(-1)).toMatchObject({
      to: "gunna-trip@example.com",
      subject: "Trip cancelled: Weather",
      text: expect.stringMatching(
        /^BSÍ bus terminal – Hof bus stop, Akureyri · Saturday 14 November at 09:00\. Full refund of /,
      ) as unknown,
    });
    expect(JSON.stringify([push.sent, sms.outbox, email.sent])).not.toMatch(/snow/);
    expect((await logOf(anna)).filter((row) => row.kind === "trip_cancelled")).toEqual([]);

    // Run again: nobody is told twice.
    await worker().runOnce();
    expect(push.sent).toHaveLength(2);
    expect(sms.outbox).toHaveLength(2);
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
      receipts: () => Promise.resolve(new Map()),
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

describe("push tokens that no longer work (plan 4.5)", () => {
  it("removes a token the push service refuses as no longer registered, and skips the push", async () => {
    const anna = await driverOf(north);
    const device = await withDevice(anna);
    push.refused.set(device.token, "DeviceNotRegistered");
    const jon = await newMember("Jón");
    await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    await worker().runOnce();
    expect(await api.connection.db.select().from(schema.pushTokens)).toEqual([]);
    await later(30);
    await worker().runOnce();
    expect(push.sent).toEqual([]);
    expect(await logOf(anna)).toContainEqual(
      expect.objectContaining({ channel: "push", status: "skipped", reason: "no_device" }),
    );
  });

  it("asks for the receipt 15 minutes after a push, and removes the token if it is no longer registered", async () => {
    const anna = await driverOf(north);
    await withDevice(anna);
    const jon = await newMember("Jón");
    await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    await worker().runOnce();
    expect(push.sent).toHaveLength(1);
    push.receiptsGiven.set("ticket-1", { status: "error", code: "DeviceNotRegistered" });
    await later(14 * 60);
    await worker().runOnce();
    expect(push.checked).toEqual([]);
    await later(60);
    expect(await worker().runOnce()).toMatchObject({ receipts: 1 });
    expect(push.checked).toEqual([["ticket-1"]]);
    expect(await api.connection.db.select().from(schema.pushTokens)).toEqual([]);
    expect(await api.connection.db.select().from(schema.pushTickets)).toEqual([]);
  });

  it("keeps a token whose receipt is fine, asks again for one not ready, and lets it go after a day", async () => {
    const anna = await driverOf(north);
    await withDevice(anna);
    for (const name of ["Jón", "Gunna"]) {
      const member = await newMember(name);
      await booked(member.accessToken, north, { fromStop: 0, toStop: 1 });
    }
    await worker().runOnce();
    push.receiptsGiven.set("ticket-1", { status: "ok" });
    await later(15 * 60);
    await worker().runOnce();
    const left = () =>
      api.connection.db.select({ id: schema.pushTickets.id }).from(schema.pushTickets);
    expect(await left()).toEqual([{ id: "ticket-2" }]);
    await later(15 * 60);
    await worker().runOnce();
    expect(push.checked).toEqual([["ticket-1", "ticket-2"], ["ticket-2"]]);
    await later(24 * 3600);
    await worker().runOnce();
    expect(await left()).toEqual([]);
    expect(await api.connection.db.select().from(schema.pushTokens)).toHaveLength(1);
  });

  it("never lets the old token's receipt remove the new one the phone registered since", async () => {
    const anna = await driverOf(north);
    const register = (token: string) =>
      api.client.call(setPushTokenRoute, { accessToken: anna.accessToken, body: { token } });
    await register("ExponentPushToken[old]");
    const jon = await newMember("Jón");
    await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    await worker().runOnce();
    expect(push.sent.map((sent) => sent.to)).toEqual(["ExponentPushToken[old]"]);
    // The old token stopped working, so the phone got a new one.
    push.receiptsGiven.set("ticket-1", { status: "error", code: "DeviceNotRegistered" });
    await register("ExponentPushToken[new]");
    await later(15 * 60);
    await worker().runOnce();
    const tokens = await api.connection.db
      .select({ token: schema.pushTokens.token })
      .from(schema.pushTokens);
    expect(tokens).toEqual([{ token: "ExponentPushToken[new]" }]);
  });

  it("never tries again a push that may have gone out", async () => {
    const anna = await driverOf(north);
    await withDevice(anna);
    push.failure = new PushMaybeSent("Expo's push service did not answer in time");
    const jon = await newMember("Jón");
    await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    await worker().runOnce();
    push.failure = null;
    await later(3600);
    await worker().runOnce();
    expect(push.attempts).toBe(1);
    expect(await logOf(anna)).toContainEqual(
      expect.objectContaining({ channel: "push", status: "failed", reason: "interrupted" }),
    );
  });

  it("asks again in 15 minutes when Expo cannot give receipts, and lets tickets go after a day all the same", async () => {
    const anna = await driverOf(north);
    await withDevice(anna);
    const jon = await newMember("Jón");
    await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    await worker().runOnce();
    push.receiptsFailure = new Error("Expo's push service refused the request (HTTP 503)");
    await later(15 * 60);
    await expect(worker().runOnce()).rejects.toThrow("HTTP 503");
    await later(5);
    await worker().runOnce();
    expect(push.checked).toHaveLength(1);
    await later(24 * 3600);
    await expect(worker().runOnce()).resolves.toMatchObject({ receipts: 0 });
    expect(push.checked).toHaveLength(1);
    expect(await api.connection.db.select().from(schema.pushTickets)).toEqual([]);
  });

  it("counts a push as sent when its token went while it was on its way", async () => {
    const anna = await driverOf(north);
    await withDevice(anna);
    push.whileSending = () => api.connection.db.delete(schema.pushTokens);
    const jon = await newMember("Jón");
    await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    await expect(worker().runOnce()).resolves.toMatchObject({ sent: 1 });
    expect(await logOf(anna)).toContainEqual(
      expect.objectContaining({ channel: "push", status: "sent" }),
    );
    expect(await api.connection.db.select().from(schema.pushTickets)).toEqual([]);
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

describe("email (plan 4.6)", () => {
  it("never tries again an email that may have gone out, and tries again one that was refused", async () => {
    const anna = await driverOf(north);
    await withEmail(anna, "anna-retry@example.com");
    email.failure = new EmailMaybeSent("Mailjet did not answer in time");
    const jon = await newMember("Jón");
    await booked(jon.accessToken, north, { fromStop: 0, toStop: 1 });
    await worker().runOnce();
    email.failure = new Error("Mailjet refused the email (HTTP 503)");
    const gunna = await newMember("Gunna");
    await booked(gunna.accessToken, north, { fromStop: 1, toStop: 2 });
    await worker().runOnce();
    email.failure = null;
    await later(3600);
    await worker().runOnce();
    expect(email.sent.map((sent) => sent.subject)).toEqual(["New request: Gunna"]);
    expect((await logOf(anna)).filter((row) => row.channel === "email")).toMatchObject([
      { kind: "request_new", status: "failed", reason: "interrupted", attempts: 1 },
      { kind: "request_new", status: "sent", attempts: 2 },
    ]);
  });

  it("tells someone without push of unread messages 15 minutes on, never their text, at most once an hour per conversation (3.6, item 3)", async () => {
    const { jon, passenger, bookingId } = await confirmedBooking();
    await withEmail(passenger, "gunna-unread@example.com");
    await worker().runOnce();
    email.sent.length = 0;
    await send(jon, bookingId, { text: "My door code is 4512" });
    await worker().runOnce();
    await later(14 * 60);
    await worker().runOnce();
    expect(email.sent).toEqual([]);

    await later(60);
    await worker().runOnce();
    expect(email.sent.map((sent) => [sent.to, sent.subject])).toEqual([
      [
        "gunna-unread@example.com",
        expect.stringMatching(/^You have unread messages about your trip on \w+day \d+ \w+$/),
      ],
    ]);
    expect(email.sent[0]?.text).toMatch(/^Open the chat in ShareRide to read them\.\n/);
    expect(email.sent[0]?.text).toContain(`Open in ShareRide: ${webAppUrl}/messages/${bookingId}`);
    expect(JSON.stringify(email.sent)).not.toContain("4512");

    // Five minutes on, another message: its email waits for the hour.
    await later(5 * 60, jon);
    await send(jon, bookingId, { text: "Are you there?" });
    await send(jon, bookingId, { quick: { key: "whereAreYou" } });
    await worker().runOnce();
    await later(54 * 60);
    await worker().runOnce();
    expect(email.sent).toHaveLength(1);
    await later(60);
    await worker().runOnce();
    expect(email.sent).toHaveLength(2);
    expect((await logOf(passenger)).filter((row) => row.kind === "unread_messages")).toEqual([
      { kind: "unread_messages", channel: "email", status: "sent", reason: null, attempts: 1 },
      { kind: "unread_messages", channel: "email", status: "sent", reason: null, attempts: 1 },
    ]);
  });

  it("sends nothing once the messages are read", async () => {
    const { jon, passenger, bookingId } = await confirmedBooking();
    await withEmail(passenger, "gunna-read@example.com");
    await worker().runOnce();
    email.sent.length = 0;
    const message = await send(jon, bookingId, { text: "On my way" });
    await worker().runOnce();
    await later(10 * 60, passenger);
    const read = await api.client.call(readMessagesRoute, {
      accessToken: passenger.accessToken,
      params: { id: bookingId },
      body: { upTo: message.id },
    });
    expect(read.ok).toBe(true);
    await later(10 * 60);
    await worker().runOnce();
    expect(email.sent).toEqual([]);
    expect(await logOf(passenger)).not.toContainEqual(
      expect.objectContaining({ kind: "unread_messages" }),
    );
    const schedules = await api.connection.db
      .select({ kind: scheduledNotifications.kind, doneAt: scheduledNotifications.doneAt })
      .from(scheduledNotifications)
      .where(eq(scheduledNotifications.kind, "unread_messages"));
    expect(schedules).toEqual([{ kind: "unread_messages", doneAt: expect.any(Date) as unknown }]);
  });

  it("gives a message written after the others were read its own 15 minutes", async () => {
    const { jon, passenger, bookingId } = await confirmedBooking();
    await withEmail(passenger, "gunna-newer@example.com");
    await worker().runOnce();
    email.sent.length = 0;
    const first = await send(jon, bookingId, { text: "On my way" });
    await worker().runOnce();
    await later(10 * 60, passenger);
    await api.client.call(readMessagesRoute, {
      accessToken: passenger.accessToken,
      params: { id: bookingId },
      body: { upTo: first.id },
    });
    await later(2 * 60, jon);
    await send(jon, bookingId, { text: "I am at the gate" });
    await worker().runOnce();
    await later(3 * 60);
    await worker().runOnce();
    await later(11 * 60);
    await worker().runOnce();
    expect(email.sent).toEqual([]);
    await later(60);
    await worker().runOnce();
    expect(email.sent).toHaveLength(1);
  });

  it("never counts the reader's own messages as unread", async () => {
    const { jon, passenger, bookingId } = await confirmedBooking();
    await withEmail(jon, "jon-own@example.com");
    await withEmail(passenger, "gunna-own@example.com");
    await worker().runOnce();
    email.sent.length = 0;
    await send(jon, bookingId, { text: "I have a big bag" });
    const asked = await send(passenger, bookingId, { text: "Is there room for skis?" });
    await worker().runOnce();
    await later(5 * 60, jon);
    await api.client.call(readMessagesRoute, {
      accessToken: jon.accessToken,
      params: { id: bookingId },
      body: { upTo: asked.id },
    });
    await later(10 * 60);
    await worker().runOnce();
    expect(email.sent.map((sent) => sent.to)).toEqual(["gunna-own@example.com"]);
  });

  it("drops a refused unread email, when it is tried again, once the messages are read", async () => {
    const { jon, passenger, bookingId } = await confirmedBooking();
    await withEmail(passenger, "gunna-retried@example.com");
    await worker().runOnce();
    email.sent.length = 0;
    const message = await send(jon, bookingId, { text: "On my way" });
    await worker().runOnce();
    await later(15 * 60, passenger);
    email.failure = new Error("Mailjet refused the email (HTTP 503)");
    await worker().runOnce();
    email.failure = null;
    await api.client.call(readMessagesRoute, {
      accessToken: passenger.accessToken,
      params: { id: bookingId },
      body: { upTo: message.id },
    });
    await later(10 * 60);
    await worker().runOnce();
    expect(email.sent).toEqual([]);
    expect((await logOf(passenger)).filter((row) => row.kind === "unread_messages")).toEqual([
      {
        kind: "unread_messages",
        channel: "email",
        status: "skipped",
        reason: "no_longer_applies",
        attempts: 2,
      },
    ]);
  });

  it("keeps one unread email waiting per conversation and reader, even when two workers schedule one at once", async () => {
    const { jon, bookingId } = await confirmedBooking();
    await send(jon, bookingId, { text: "On my way" });
    await worker().runOnce();
    const now = api.now();
    const second = await api.connection.db
      .insert(scheduledNotifications)
      .values({
        key: `unread_messages:${bookingId}:passenger:another`,
        kind: "unread_messages",
        bookingId,
        recipient: "passenger",
        runAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();
    expect(second).toEqual([]);
  });

  it("emails nobody with push about unread messages: the push has told them", async () => {
    const { jon, passenger, bookingId } = await confirmedBooking();
    await withEmail(jon, "jon-push@example.com");
    await withDevice(jon);
    await worker().runOnce();
    email.sent.length = 0;
    await send(passenger, bookingId, { text: "Where shall I wait?" });
    await worker().runOnce();
    await later(15 * 60);
    await worker().runOnce();
    expect(email.sent).toEqual([]);
    expect((await logOf(jon)).filter((row) => row.kind === "unread_messages")).toEqual([
      {
        kind: "unread_messages",
        channel: "email",
        status: "skipped",
        reason: "has_push",
        attempts: 0,
      },
    ]);
  });
});

describe("trip reminders (spec 7, 3.5)", () => {
  const forGunna = (passenger: Member) => (message: { to: string }) =>
    message.to === `ExponentPushToken[${passenger.userId}]`;

  async function remindersOff(member: Member) {
    // As the settings route does; its access token may have run out by now.
    await setPreferences(api.connection.db, member.userId, { reminders: false }, api.now());
  }

  /**
   * Moves the clock on to `time` (Iceland keeps UTC all year). Each sign-in
   * moves the clock on a little, so the tests name the times they mean.
   */
  async function until(time: string) {
    const seconds = (new Date(time).getTime() - api.now().getTime()) / 1000;
    if (seconds < 0) throw new Error(`The clock is already past ${time}.`);
    await later(seconds);
  }

  const friday18 = "2026-11-13T18:00:00Z";
  const saturday0430 = "2026-11-14T04:30:00Z";

  async function ended(bookingId: string) {
    // As a cancellation (spec 6) will.
    await api.connection.db
      .update(schema.bookings)
      .set({ status: "cancelled" })
      .where(eq(schema.bookings.id, bookingId));
  }

  it("reminds a passenger at 18:00 the evening before and an hour before boarding, once each", async () => {
    const { jon, passenger } = await confirmedBooking();
    await withDevice(passenger);
    await withDevice(jon);
    await worker().runOnce();
    push.sent.length = 0;

    // Friday 18:00, then Saturday 04:30: the trip leaves Hlemmur at 05:30.
    await until(friday18);
    await worker().runOnce();
    await worker().runOnce();
    await until(saturday0430);
    await worker().runOnce();
    const gunnas = push.sent.filter(forGunna(passenger));
    expect(gunnas.map(({ title, body, data }) => ({ title, body, data }))).toEqual([
      {
        title: "Tomorrow at 05:30 · Meeting point: Hlemmur",
        body: "Driver: Jón · Blue Kia Ceed",
        data: { path: expect.stringMatching(/^\/meeting-points\/[0-9a-f-]+$/) as unknown },
      },
      {
        title: "In one hour, at 05:30 · Meeting point: Hlemmur",
        body: "Driver: Jón · Blue Kia Ceed",
        data: { path: gunnas[0]?.data.path },
      },
    ]);
  });

  it("reminds the driver once of everyone booked, and of the missing number plate", async () => {
    const { jon } = await confirmedBooking("Gunna");
    const dora = await newMember("Dóra");
    const second = await booked(dora.accessToken, airport, { fromStop: 1, toStop: 2 });
    await paid(dora.accessToken, second.id);
    await withDevice(jon);
    await worker().runOnce();
    push.sent.length = 0;

    await until(friday18);
    await worker().runOnce();
    const driver = push.sent.filter((message) => message.to === `ExponentPushToken[${jon.userId}]`);
    expect(driver).toMatchObject([
      {
        title: "Tomorrow at 05:30: 2 passengers",
        body: expect.stringMatching(
          /^Gunna: Hlemmur – .+\nDóra: Fjörður shopping centre – .+\nAdd your number plate so passengers can find your car\.$/,
        ) as unknown,
        data: { path: expect.stringMatching(/^\/drive\/trips\//) as unknown },
      },
    ]);

    push.sent.length = 0;
    await until(saturday0430);
    await worker().runOnce();
    expect(push.sent.map((message) => message.title)).toEqual([
      "In one hour, at 05:30: 2 passengers",
    ]);
  });

  it("reminds the driver only of who is still booked, even someone who booked after the first left", async () => {
    const { jon, bookingId } = await confirmedBooking("Gunna");
    await withDevice(jon);
    await worker().runOnce();
    await ended(bookingId);
    await later(3600);
    const dora = await newMember("Dóra");
    const second = await booked(dora.accessToken, airport, { fromStop: 1, toStop: 2 });
    await paid(dora.accessToken, second.id);
    await worker().runOnce();
    push.sent.length = 0;

    await until(friday18);
    await worker().runOnce();
    expect(push.sent.map(({ title, body }) => ({ title, body }))).toEqual([
      {
        title: "Tomorrow at 05:30: 1 passenger",
        body: expect.stringMatching(
          /^Dóra: Fjörður shopping centre – [^\n]+\nAdd your number plate/,
        ) as unknown,
      },
    ]);
  });

  it("drops a reminder once the booking has ended, and the driver's once nobody is booked", async () => {
    const { jon, passenger, bookingId } = await confirmedBooking();
    await withDevice(passenger);
    await withDevice(jon);
    await worker().runOnce();
    push.sent.length = 0;
    await ended(bookingId);
    await until(friday18);
    await worker().runOnce();
    expect(push.sent).toEqual([]);
    const due = await api.connection.db
      .select({ kind: scheduledNotifications.kind, doneAt: scheduledNotifications.doneAt })
      .from(scheduledNotifications)
      .where(lte(scheduledNotifications.runAt, api.now()))
      .orderBy(asc(scheduledNotifications.kind));
    expect(due.filter((row) => row.kind.startsWith("reminder_"))).toEqual([
      { kind: "reminder_evening", doneAt: expect.any(Date) as unknown },
      { kind: "reminder_evening_driver", doneAt: expect.any(Date) as unknown },
    ]);
  });

  it("reminds nobody of a trip the driver cancelled", async () => {
    const { jon, passenger } = await confirmedBooking();
    await withDevice(passenger);
    await withDevice(jon);
    await worker().runOnce();
    await cancelTripAs(jon, airport, "illness");
    await worker().runOnce();
    push.sent.length = 0;
    await until(friday18);
    await worker().runOnce();
    expect(push.sent).toEqual([]);
  });

  it("sends no reminders to someone who turned them off, and the rest still", async () => {
    const { jon, passenger } = await confirmedBooking();
    await withDevice(passenger);
    await withDevice(jon);
    await remindersOff(passenger);
    await worker().runOnce();
    push.sent.length = 0;
    await until(friday18);
    await worker().runOnce();
    expect(push.sent.map((message) => message.title)).toEqual(["Tomorrow at 05:30: 1 passenger"]);
  });

  it("sends the driver none once they turned them off, and the passenger still", async () => {
    const { jon, passenger } = await confirmedBooking();
    await withDevice(passenger);
    await withDevice(jon);
    await remindersOff(jon);
    await worker().runOnce();
    push.sent.length = 0;
    await until(friday18);
    await worker().runOnce();
    expect(push.sent.map((message) => message.title)).toEqual([
      "Tomorrow at 05:30 · Meeting point: Hlemmur",
    ]);
  });

  it("drops a reminder that comes too late, as after the worker was down", async () => {
    const { passenger } = await confirmedBooking();
    await withDevice(passenger);
    await worker().runOnce();
    push.sent.length = 0;
    // Down until 00:30 on Saturday: the evening one is too late.
    await until("2026-11-14T00:30:00Z");
    await worker().runOnce();
    expect(push.sent).toEqual([]);
    // And until 05:45: the hour one too, as the trip has left.
    await until("2026-11-14T05:45:00Z");
    await worker().runOnce();
    expect(push.sent).toEqual([]);
    expect((await logOf(passenger)).filter((row) => row.kind.startsWith("reminder_"))).toEqual([]);
  });

  it("skips a failed reminder tried again once the booking ended or reminders were turned off", async () => {
    const { passenger: gunna, bookingId } = await confirmedBooking("Gunna");
    const dora = await newMember("Dóra");
    const second = await booked(dora.accessToken, airport, { fromStop: 1, toStop: 2 });
    await paid(dora.accessToken, second.id);
    await withDevice(gunna);
    await withDevice(dora);
    await worker().runOnce();
    push.sent.length = 0;
    await until(friday18);
    push.failure = new Error("The push service is down.");
    await worker().runOnce();
    push.failure = null;
    await ended(bookingId);
    await remindersOff(dora);
    await later(30);
    await worker().runOnce();

    expect(push.sent).toEqual([]);
    for (const member of [gunna, dora]) {
      expect(await logOf(member)).toContainEqual({
        kind: "reminder_evening",
        channel: "push",
        status: "skipped",
        reason: "no_longer_applies",
        attempts: 2,
      });
    }
  });

  it("skips the hour reminder tried again after the trip has left", async () => {
    const { passenger } = await confirmedBooking();
    await withDevice(passenger);
    await worker().runOnce();
    await until(friday18);
    await worker().runOnce();
    push.sent.length = 0;
    await until(saturday0430);
    push.failure = new Error("The push service is down.");
    await worker().runOnce();
    push.failure = null;
    // The worker comes back at 05:31, after the trip left Hlemmur.
    await until("2026-11-14T05:31:00Z");
    await worker().runOnce();
    expect(push.sent).toEqual([]);
    expect(await logOf(passenger)).toContainEqual({
      kind: "reminder_hour",
      channel: "push",
      status: "skipped",
      reason: "no_longer_applies",
      attempts: 2,
    });
  });

  it("skips a reminder whose time passed before the booking was confirmed", async () => {
    // Confirmed at 19:00, after the evening reminder's 18:00.
    await until("2026-11-13T19:00:00Z");
    const { passenger } = await confirmedBooking();
    await withDevice(passenger);
    await worker().runOnce();
    push.sent.length = 0;
    await until(saturday0430);
    await worker().runOnce();
    expect(push.sent.filter(forGunna(passenger)).map((message) => message.title)).toEqual([
      "In one hour, at 05:30 · Meeting point: Hlemmur",
    ]);
  });

  it("emails the evening reminder, with Directions, to someone without push, but not the hour one", async () => {
    const { passenger } = await confirmedBooking();
    await withEmail(passenger, "gunna-reminder@example.com");
    await worker().runOnce();
    email.sent.length = 0;
    await until(friday18);
    await worker().runOnce();
    await until(saturday0430);
    await worker().runOnce();
    expect(email.sent.map((sent) => sent.subject)).toEqual([
      "Tomorrow at 05:30 · Meeting point: Hlemmur",
    ]);
    expect(email.sent[0]?.text).toMatch(
      new RegExp(`Directions: ${webAppUrl}/meeting-points/[0-9a-f-]+`),
    );
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
