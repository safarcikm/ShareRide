import { schema, type Database } from "@shareride/db";
import {
  channelsFor,
  defaultNotificationSettings,
  eventAttempts,
  notificationsFor,
  payReminderAt,
  requestHalfwayAt,
  retryAt,
  sendLeaseSeconds,
  statusAt,
  stillApplies,
  type BookingStatus,
  type ChannelDecision,
  type NotificationEvent,
  type NotificationSettings,
  type OutboxEventType,
  type Recipient,
  type TripRole,
} from "@shareride/domain";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { EmailSender } from "../../platform/email.ts";
import {
  PushMaybeSent,
  deviceNotRegistered,
  type PushReceipt,
  type PushSender,
} from "../../platform/push.ts";
import type { Queryable, Transaction } from "../bookings/seats.ts";
import { quickOf } from "../chat/service.ts";
import { notificationText, type NotificationFacts } from "./texts.ts";

// The notification worker (spec 7, 3.7; plan 4.4), every few seconds inside
// the API. Each step takes rows with FOR UPDATE SKIP LOCKED, so two API
// instances share the work, and unique keys make a second run add nothing.

const {
  bookings,
  conversations,
  meetingPoints,
  messages,
  notificationDeliveries,
  notifications,
  outboxEvents,
  pushTickets,
  pushTokens,
  scheduledNotifications,
  sessions,
  trips,
  tripStops,
  users,
} = schema;

/** Rows each step takes per run; the rest wait for the next run. */
const batchSize = 50;

const minuteMs = 60_000;
/**
 * A push's receipt is asked for this long after it was sent; one not ready
 * is asked for again, until the push service no longer keeps it.
 */
const receiptAfterMs = 15 * minuteMs;
const receiptsKeptMs = 24 * 60 * minuteMs;
/** The push service answers about at most this many tickets at a time. */
const receiptsPerRun = 1000;

export interface WorkerRun {
  /** Events turned into notifications. */
  readonly events: number;
  /** Scheduled notifications whose moment came, sent or dropped. */
  readonly scheduled: number;
  readonly sent: number;
  /** Sends that failed, to be tried again or given up. */
  readonly failed: number;
  /** Push receipts that came back. */
  readonly receipts: number;
}

export interface NotificationWorker {
  /** One pass: events, scheduled notifications that are due, sends that are due, then push receipts. */
  runOnce(): Promise<WorkerRun>;
}

type Delivery = typeof notificationDeliveries.$inferSelect;
type Parties = NonNullable<Awaited<ReturnType<typeof partiesOf>>>;

/** A booking's driver, passenger and deadlines. */
async function partiesOf(q: Queryable, bookingId: string) {
  const [row] = await q
    .select({
      id: bookings.id,
      tripId: bookings.tripId,
      passengerId: bookings.passengerId,
      driverId: trips.driverId,
      status: bookings.status,
      requestedAt: bookings.requestedAt,
      expiresAt: bookings.expiresAt,
      decidedAt: bookings.decidedAt,
      paymentDueAt: bookings.paymentDueAt,
    })
    .from(bookings)
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .where(eq(bookings.id, bookingId));
  return row;
}

/** The push tokens of the person's sessions that have not ended (plan 4.4, channels). */
function tokensOf(q: Queryable, userId: string) {
  return q
    .select({ id: pushTokens.id, token: pushTokens.token })
    .from(pushTokens)
    .innerJoin(sessions, eq(sessions.id, pushTokens.sessionId))
    .where(and(eq(pushTokens.userId, userId), isNull(sessions.endedAt)));
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An ID from an event's payload (events carry IDs only), or none if it is not one. */
function idIn(payload: Readonly<Record<string, string>>, name: string): string | undefined {
  const value = payload[name];
  return typeof value === "string" && uuidPattern.test(value) ? value : undefined;
}

const boards = alias(tripStops, "boards");
const alights = alias(tripStops, "alights");
const boardPoint = alias(meetingPoints, "board_point");
const alightPoint = alias(meetingPoints, "alight_point");
const recipients = alias(users, "recipient");
const drivers = alias(users, "driver");
const passengers = alias(users, "passenger");

/** What a notification's text is made from, and where it goes, as of now. */
async function factsOf(q: Queryable, notificationId: string) {
  const [row] = await q
    .select({
      notification: notifications,
      booking: bookings,
      driverId: trips.driverId,
      boardsAt: boards.plannedAt,
      board: { is: boardPoint.nameIs, en: boardPoint.nameEn },
      alight: { is: alightPoint.nameIs, en: alightPoint.nameEn },
      recipient: {
        locale: recipients.locale,
        email: recipients.email,
        emailVerifiedAt: recipients.emailVerifiedAt,
      },
      driverName: drivers.firstName,
      passengerName: passengers.firstName,
    })
    .from(notifications)
    .innerJoin(bookings, eq(bookings.id, notifications.bookingId))
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .innerJoin(boards, eq(boards.id, bookings.fromStopId))
    .innerJoin(alights, eq(alights.id, bookings.toStopId))
    .innerJoin(boardPoint, eq(boardPoint.id, boards.meetingPointId))
    .innerJoin(alightPoint, eq(alightPoint.id, alights.meetingPointId))
    .innerJoin(recipients, eq(recipients.id, notifications.recipientId))
    .innerJoin(drivers, eq(drivers.id, trips.driverId))
    .innerJoin(passengers, eq(passengers.id, bookings.passengerId))
    .where(eq(notifications.id, notificationId));
  if (row === undefined) return undefined;
  const { notification, booking, recipient } = row;
  if (row.boardsAt === null) throw new Error("A booked trip has the times of its stops.");
  const [message] =
    notification.messageId === null
      ? []
      : await q.select().from(messages).where(eq(messages.id, notification.messageId));
  const locale = recipient.locale === "is" ? "is" : "en";
  const named = (point: { readonly is: string; readonly en: string | null }) =>
    locale === "en" ? (point.en ?? point.is) : point.is;
  const role: TripRole = notification.recipientId === row.driverId ? "driver" : "passenger";
  const facts: NotificationFacts = {
    kind: notification.kind as NotificationFacts["kind"],
    role,
    bookingId: booking.id,
    tripId: booking.tripId,
    name: (role === "driver" ? row.passengerName : row.driverName) ?? "",
    seats: booking.seats,
    total: { amount: booking.totalPrice, currency: "ISK" },
    from: named(row.board),
    to: named(row.alight),
    boardsAt: row.boardsAt,
    requestExpiresAt: booking.expiresAt,
    paymentDueAt: booking.paymentDueAt,
    message:
      message === undefined
        ? null
        : message.kind === "text"
          ? { text: message.body ?? "" }
          : { quick: quickOf(message) },
  };
  return {
    facts,
    locale,
    recipientId: notification.recipientId,
    email: recipient.emailVerifiedAt === null ? null : recipient.email,
    booking: {
      status: booking.status as BookingStatus,
      requestExpiresAt: booking.expiresAt,
      paymentDueAt: booking.paymentDueAt,
    },
  } as const;
}

/** What a push did to the device's tokens: tickets to ask about later, and tokens gone. */
interface PushOutcome {
  readonly tickets: readonly { readonly id: string; readonly tokenId: string }[];
  readonly gone: readonly string[];
}

type SendResult =
  { readonly ref: string; readonly push?: PushOutcome } | { readonly skipped: string };

export function createNotificationWorker(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly push: PushSender;
  /** Without it, email is skipped as `email_off` (until decision 3's provider, PR 7). */
  readonly email?: EmailSender;
  readonly settings?: NotificationSettings;
  /** A send that failed, for the logs: never the text or the address. */
  readonly onSendError?: (error: unknown, delivery: { id: string; channel: string }) => void;
  /**
   * An event that could not be turned into notifications, for the logs: its
   * ID and kind only. `givenUp` once it has failed `eventAttempts` times.
   */
  readonly onEventError?: (
    error: unknown,
    event: { id: string; kind: string; givenUp: boolean },
  ) => void;
}): NotificationWorker {
  const { db, clock, push, email, onSendError, onEventError } = dependencies;
  const settings = dependencies.settings ?? defaultNotificationSettings;

  /** What the catalogue needs to know about a person to pick the channels. */
  async function recipientOf(q: Queryable, userId: string, role: TripRole): Promise<Recipient> {
    const [user] = await q
      .select({
        email: users.email,
        emailVerifiedAt: users.emailVerifiedAt,
        phoneVerifiedAt: users.phoneVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, userId));
    const tokens = await tokensOf(q, userId);
    return {
      role,
      hasPushDevice: tokens.length > 0,
      hasVerifiedEmail: (user?.email ?? null) !== null && (user?.emailVerifiedAt ?? null) !== null,
      hasVerifiedPhone: (user?.phoneVerifiedAt ?? null) !== null,
      // SMS news comes with the trip changes of spec 6; none of the events
      // here use it, and without a boarding time it is never sent.
      boardsAt: null,
      smsSentToday: 0,
    };
  }

  function deliveryOf(notificationId: string, decision: ChannelDecision, now: Date) {
    const base = { notificationId, channel: decision.channel, createdAt: now, updatedAt: now };
    if (!decision.send) return { ...base, status: "skipped", reason: decision.reason };
    if (decision.channel === "email" && email === undefined) {
      return { ...base, status: "skipped", reason: "email_off" };
    }
    if (decision.channel === "sms") return { ...base, status: "skipped", reason: "sms_off" };
    return { ...base, status: "queued", nextAttemptAt: now };
  }

  /**
   * The event's notifications, one per person, each with a delivery per
   * channel. A notification made by an earlier run has the same key, so
   * nothing is added the second time.
   */
  async function notify(
    tx: Transaction,
    event: NotificationEvent,
    booking: Parties,
    source: { readonly key: string; readonly messageId?: string },
    now: Date,
  ): Promise<void> {
    for (const { kind, to } of notificationsFor(event)) {
      const recipientId = to === "driver" ? booking.driverId : booking.passengerId;
      const [created] = await tx
        .insert(notifications)
        .values({
          recipientId,
          kind,
          bookingId: booking.id,
          messageId: source.messageId ?? null,
          uniqueKey: `${source.key}:${kind}:${recipientId}`,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: notifications.id });
      if (created === undefined) continue;
      const decisions = channelsFor(kind, await recipientOf(tx, recipientId, to), now, settings);
      if (decisions.length === 0) continue;
      await tx
        .insert(notificationDeliveries)
        .values(decisions.map((decision) => deliveryOf(created.id, decision, now)));
    }
  }

  /** The halfway and pay reminders that follow a request and an acceptance. */
  async function scheduleAfter(
    tx: Transaction,
    type: OutboxEventType,
    booking: Parties,
    now: Date,
  ): Promise<void> {
    const schedule = (kind: "request_halfway" | "pay_reminder", runAt: Date) =>
      tx
        .insert(scheduledNotifications)
        .values({
          key: `${kind}:${booking.id}`,
          kind,
          bookingId: booking.id,
          runAt,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();
    const { requestedAt, expiresAt, decidedAt, paymentDueAt } = booking;
    if (type === "BookingRequested" && requestedAt !== null && expiresAt !== null) {
      await schedule("request_halfway", requestHalfwayAt({ requestedAt, expiresAt }));
    }
    if (type === "BookingAccepted" && decidedAt !== null && paymentDueAt !== null) {
      const at = payReminderAt({ acceptedAt: decidedAt, dueAt: paymentDueAt }, settings);
      if (at !== null) await schedule("pay_reminder", at);
    }
  }

  async function handleEvent(
    tx: Transaction,
    event: typeof outboxEvents.$inferSelect,
    now: Date,
  ): Promise<void> {
    const type = event.kind as OutboxEventType;
    const key = `event:${event.id}`;
    if (type === "MessageSent") {
      const messageId = idIn(event.payload, "messageId");
      if (messageId === undefined) return;
      const [found] = await tx
        .select({ bookingId: conversations.bookingId, senderId: messages.senderId })
        .from(messages)
        .innerJoin(conversations, eq(conversations.id, messages.conversationId))
        .where(eq(messages.id, messageId));
      // Gone with its conversation, or a system line, which tells nobody.
      if (found === undefined || found.senderId === null) return;
      const booking = await partiesOf(tx, found.bookingId);
      if (booking === undefined) return;
      const to = found.senderId === booking.driverId ? "passenger" : "driver";
      await notify(tx, { type, to }, booking, { key, messageId }, now);
      return;
    }
    const bookingId = idIn(event.payload, "bookingId");
    const booking = bookingId === undefined ? undefined : await partiesOf(tx, bookingId);
    // A booking deleted since, with its account, tells nobody.
    if (booking === undefined) return;
    const happened: NotificationEvent =
      type === "BookingExpired"
        ? { type, reason: event.payload["reason"] === "unpaid" ? "unpaid" : "unanswered" }
        : { type };
    await notify(tx, happened, booking, { key }, now);
    await scheduleAfter(tx, type, booking, now);
  }

  /**
   * Step 1: the oldest events become notifications, in one transaction. Each
   * event has its own savepoint: one that fails is tried again on the next
   * runs and given up after `eventAttempts`, and never holds back the rest.
   */
  function takeEvents(): Promise<number> {
    return db.transaction(async (tx) => {
      const now = clock();
      const due = await tx
        .select()
        .from(outboxEvents)
        .where(isNull(outboxEvents.processedAt))
        .orderBy(asc(outboxEvents.createdAt), asc(outboxEvents.id))
        .limit(batchSize)
        .for("update", { skipLocked: true });
      const done: string[] = [];
      for (const event of due) {
        try {
          await tx.transaction((savepoint) => handleEvent(savepoint, event, now));
          done.push(event.id);
        } catch (error) {
          const givenUp = event.attempts + 1 >= eventAttempts;
          await tx
            .update(outboxEvents)
            .set({
              attempts: event.attempts + 1,
              ...(givenUp ? { processedAt: now, failedAt: now } : {}),
              updatedAt: now,
            })
            .where(eq(outboxEvents.id, event.id));
          onEventError?.(error, { id: event.id, kind: event.kind, givenUp });
        }
      }
      if (done.length > 0) {
        await tx
          .update(outboxEvents)
          .set({ processedAt: now, updatedAt: now })
          .where(inArray(outboxEvents.id, done));
      }
      return done.length;
    });
  }

  /** What a scheduled notification gives if it still applies at its moment. */
  function stillDue(kind: string, booking: Parties, now: Date): NotificationEvent | null {
    const status = statusAt(
      {
        status: booking.status as BookingStatus,
        requestExpiresAt: booking.expiresAt,
        paymentDueAt: booking.paymentDueAt,
      },
      now,
    );
    if (kind === "request_halfway" && stillApplies(kind, status)) return { type: "RequestHalfway" };
    if (kind === "pay_reminder" && stillApplies(kind, status)) return { type: "PaymentDueSoon" };
    return null;
  }

  /** Step 2: scheduled notifications whose moment came, sent if they still apply, else dropped. */
  function takeSchedules(): Promise<number> {
    return db.transaction(async (tx) => {
      const now = clock();
      const due = await tx
        .select()
        .from(scheduledNotifications)
        .where(and(isNull(scheduledNotifications.doneAt), lte(scheduledNotifications.runAt, now)))
        .orderBy(asc(scheduledNotifications.runAt))
        .limit(batchSize)
        .for("update", { skipLocked: true });
      for (const scheduled of due) {
        const booking =
          scheduled.bookingId === null ? undefined : await partiesOf(tx, scheduled.bookingId);
        const event = booking === undefined ? null : stillDue(scheduled.kind, booking, now);
        if (booking !== undefined && event !== null) {
          await notify(tx, event, booking, { key: `schedule:${scheduled.key}` }, now);
        }
      }
      if (due.length > 0) {
        await tx
          .update(scheduledNotifications)
          .set({ doneAt: now, updatedAt: now })
          .where(
            inArray(
              scheduledNotifications.id,
              due.map((scheduled) => scheduled.id),
            ),
          );
      }
      return due.length;
    });
  }

  /** Takes the next delivery that is due, with a lease, or none. */
  async function claim(): Promise<Delivery | undefined> {
    const now = clock();
    const next = db
      .select({ id: notificationDeliveries.id })
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.status, "queued"),
          lte(notificationDeliveries.nextAttemptAt, now),
        ),
      )
      .orderBy(asc(notificationDeliveries.nextAttemptAt))
      .limit(1)
      .for("update", { skipLocked: true });
    const [claimed] = await db
      .update(notificationDeliveries)
      .set({
        status: "sending",
        attempts: sql`${notificationDeliveries.attempts} + 1`,
        nextAttemptAt: new Date(now.getTime() + sendLeaseSeconds * 1000),
        updatedAt: now,
      })
      .where(eq(notificationDeliveries.id, sql`(${next})`))
      .returning();
    return claimed;
  }

  /** Tokens the push service says no longer work. */
  async function forgetTokens(ids: readonly string[]): Promise<void> {
    if (ids.length > 0) await db.delete(pushTokens).where(inArray(pushTokens.id, [...ids]));
  }

  /** After a push went out: its tickets, to ask about later, and the tokens gone. */
  async function afterPush(outcome: PushOutcome, now: Date): Promise<void> {
    await forgetTokens(outcome.gone);
    if (outcome.tickets.length === 0) return;
    // A token that went while the push was on its way has nothing to ask about.
    const still = await db
      .select({ id: pushTokens.id })
      .from(pushTokens)
      .where(inArray(pushTokens.id, [...new Set(outcome.tickets.map((ticket) => ticket.tokenId))]));
    const live = new Set(still.map((token) => token.id));
    const tickets = outcome.tickets.filter((ticket) => live.has(ticket.tokenId));
    if (tickets.length === 0) return;
    await db
      .insert(pushTickets)
      .values(
        tickets.map((ticket) => ({
          id: ticket.id,
          pushTokenId: ticket.tokenId,
          checkAt: new Date(now.getTime() + receiptAfterMs),
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoNothing();
  }

  async function sendOn(delivery: Delivery): Promise<SendResult | undefined> {
    const found = await factsOf(db, delivery.notificationId);
    if (found === undefined) return undefined;
    // Looked at again on every try: a retry after the booking moved on is dropped.
    if (!stillApplies(found.facts.kind, statusAt(found.booking, clock()))) {
      return { skipped: "no_longer_applies" };
    }
    const text = () => notificationText(found.facts, found.locale, settings);
    switch (delivery.channel) {
      case "push": {
        // Looked up again: a session may have ended since.
        const tokens = await tokensOf(db, found.recipientId);
        if (tokens.length === 0) return { skipped: "no_device" };
        const { title, body, path } = text();
        const tickets = await push.send(
          tokens.map(({ token }) => ({ to: token, title, body, data: { path } })),
        );
        const outcome: PushOutcome = {
          tickets: tokens.flatMap(({ id: tokenId }, index) => {
            const ticket = tickets[index];
            return ticket?.status === "ok" && ticket.id !== "" ? [{ id: ticket.id, tokenId }] : [];
          }),
          gone: tokens.flatMap(({ id: tokenId }, index) => {
            const ticket = tickets[index];
            return ticket?.status === "error" && ticket.code === deviceNotRegistered
              ? [tokenId]
              : [];
          }),
        };
        if (!tickets.some((ticket) => ticket.status === "ok")) {
          // Nothing went out, so the next try goes to the tokens still there.
          await forgetTokens(outcome.gone);
          throw new Error("The push service refused every message.");
        }
        return {
          ref: outcome.tickets.map((ticket) => ticket.id).join(" "),
          push: outcome,
        };
      }
      case "email": {
        if (email === undefined) return { skipped: "email_off" };
        if (found.email === null) return { skipped: "no_email" };
        const { title, body } = text();
        const sent = await email.send({
          to: found.email,
          subject: title,
          text: body,
          idempotencyKey: delivery.id,
        });
        return { ref: sent.id };
      }
      default:
        return { skipped: "sms_off" };
    }
  }

  /**
   * Sends one claimed delivery and stores what came of it, only while this
   * worker still holds it: once the lease has run out, the sweep's
   * `interrupted` stands. A send that went through is stored even then, as
   * that is what happened. If storing it fails, the delivery stays `sending`
   * and the sweep marks it interrupted: it is never sent again (R7.6).
   */
  async function deliver(delivery: Delivery): Promise<"sent" | "failed" | "skipped"> {
    const claimed = and(
      eq(notificationDeliveries.id, delivery.id),
      eq(notificationDeliveries.attempts, delivery.attempts),
    );
    const holding = and(claimed, eq(notificationDeliveries.status, "sending"));
    const store = (changes: Partial<Delivery>, where = holding) =>
      db
        .update(notificationDeliveries)
        .set({ ...changes, updatedAt: clock() })
        .where(where);
    let result: SendResult | undefined;
    try {
      result = await sendOn(delivery);
    } catch (error) {
      onSendError?.(error, { id: delivery.id, channel: delivery.channel });
      if (error instanceof PushMaybeSent) {
        // It may have reached the phones: never sent again (R7.6).
        await store({ status: "failed", reason: "interrupted", nextAttemptAt: null });
        return "failed";
      }
      const again = retryAt(
        { queuedAt: delivery.createdAt, attempts: delivery.attempts },
        clock(),
        settings,
      );
      await store({
        status: again === null ? "failed" : "queued",
        reason: "send_failed",
        nextAttemptAt: again,
      });
      return "failed";
    }
    // Deleted with its notification in the meantime.
    if (result === undefined) return "skipped";
    if ("skipped" in result) {
      await store({ status: "skipped", reason: result.skipped, nextAttemptAt: null });
      return "skipped";
    }
    await store(
      {
        status: "sent",
        providerRef: result.ref,
        reason: null,
        sentAt: clock(),
        nextAttemptAt: null,
      },
      and(
        claimed,
        or(
          eq(notificationDeliveries.status, "sending"),
          and(
            eq(notificationDeliveries.status, "failed"),
            eq(notificationDeliveries.reason, "interrupted"),
          ),
        ),
      ),
    );
    // Book-keeping only, once the send is stored: a failure here is reported,
    // never taken for a failed send.
    if (result.push !== undefined) await afterPush(result.push, clock());
    return "sent";
  }

  /** Step 3: deliveries that are due, one at a time. */
  async function sendDue(): Promise<{ sent: number; failed: number }> {
    const now = clock();
    // A send cut off, as by a restart, may have reached the person: it is
    // never tried again, so nobody gets the same thing twice (R7.6).
    await db
      .update(notificationDeliveries)
      .set({ status: "failed", reason: "interrupted", nextAttemptAt: null, updatedAt: now })
      .where(
        and(
          eq(notificationDeliveries.status, "sending"),
          lte(notificationDeliveries.nextAttemptAt, now),
        ),
      );
    let sent = 0;
    let failed = 0;
    for (let count = 0; count < batchSize; count++) {
      const delivery = await claim();
      if (delivery === undefined) break;
      const outcome = await deliver(delivery);
      if (outcome === "sent") sent += 1;
      if (outcome === "failed") failed += 1;
    }
    return { sent, failed };
  }

  /**
   * Step 4: asks about pushes sent 15 minutes ago or more. A token the
   * phone's push service no longer knows is removed; a receipt not ready
   * yet is asked for again, until the push service no longer keeps it
   * (a day), whether or not it can be asked.
   */
  async function checkReceipts(): Promise<number> {
    const now = clock();
    const later = new Date(now.getTime() + receiptAfterMs);
    await db
      .delete(pushTickets)
      .where(lte(pushTickets.createdAt, new Date(now.getTime() - receiptsKeptMs)));
    const due = await db
      .select()
      .from(pushTickets)
      .where(lte(pushTickets.checkAt, now))
      .orderBy(asc(pushTickets.checkAt))
      .limit(receiptsPerRun);
    if (due.length === 0) return 0;
    const ids = due.map((ticket) => ticket.id);
    let receipts: ReadonlyMap<string, PushReceipt>;
    try {
      receipts = await push.receipts(ids);
    } catch (error) {
      // Asked again in 15 minutes, not on every run while Expo is down.
      await db
        .update(pushTickets)
        .set({ checkAt: later, updatedAt: now })
        .where(inArray(pushTickets.id, ids));
      throw error;
    }
    await forgetTokens(
      due.flatMap((ticket) => {
        const receipt = receipts.get(ticket.id);
        return receipt?.status === "error" && receipt.code === deviceNotRegistered
          ? [ticket.pushTokenId]
          : [];
      }),
    );
    const done = ids.filter((id) => receipts.has(id));
    if (done.length > 0) await db.delete(pushTickets).where(inArray(pushTickets.id, done));
    const waiting = ids.filter((id) => !receipts.has(id));
    if (waiting.length > 0) {
      await db
        .update(pushTickets)
        .set({ checkAt: later, updatedAt: now })
        .where(inArray(pushTickets.id, waiting));
    }
    return receipts.size;
  }

  return {
    async runOnce() {
      // Each step runs even when one before it failed; the first failure is
      // thrown once all have run, for the job to log and report.
      const failures: unknown[] = [];
      const step = async <T>(run: () => Promise<T>, none: T): Promise<T> => {
        try {
          return await run();
        } catch (error) {
          failures.push(error);
          return none;
        }
      };
      const events = await step(takeEvents, 0);
      const scheduled = await step(takeSchedules, 0);
      const { sent, failed } = await step(sendDue, { sent: 0, failed: 0 });
      const receipts = await step(checkReceipts, 0);
      if (failures.length > 0) throw failures[0];
      return { events, scheduled, sent, failed, receipts };
    },
  };
}
