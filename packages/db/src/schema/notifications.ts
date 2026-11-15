import { channels, deliveryStatuses, notificationKinds, outboxEventTypes } from "@shareride/domain";
import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { sessions } from "./auth.ts";
import { bookings } from "./bookings.ts";
import { messages } from "./chat.ts";
import { at, id, oneOf, timestamps } from "./columns.ts";
import { users } from "./users.ts";

/**
 * What happened, written in the same transaction as the change (ADR 0004's
 * queue in PostgreSQL), for the worker to turn into notifications. The
 * payload holds IDs only, never message text (R7.9). Processed events go
 * after 7 days.
 */
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: id(),
    kind: text().notNull(),
    /** Such as `{ "bookingId": "…" }`, or `{ "messageId": "…" }`. */
    payload: jsonb().$type<Readonly<Record<string, string>>>().notNull(),
    processedAt: at(),
    /** Failed tries; after `eventAttempts` it is given up: processed, with `failed_at`. */
    attempts: integer().notNull().default(0),
    failedAt: at(),
    ...timestamps,
  },
  (table) => [
    check("outbox_events_kind_check", oneOf(table.kind, outboxEventTypes)),
    // The worker takes the oldest unprocessed events.
    index("outbox_events_waiting_index")
      .on(table.createdAt)
      .where(sql`${table.processedAt} is null`),
  ],
);

/**
 * One notification to one person (spec 7, 3.3): its kind picks the text,
 * which is put into words in the person's language when it is sent. The
 * unique key, made from what caused it and the person, lets a second run
 * of the worker add nothing. Kept 90 days with its deliveries (privacy
 * register: notification log).
 */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    recipientId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    bookingId: uuid().references(() => bookings.id, { onDelete: "cascade" }),
    /** For a new message: the message, whose text the push shows (R7.9). */
    messageId: uuid().references(() => messages.id, { onDelete: "cascade" }),
    uniqueKey: text().notNull(),
    ...timestamps,
  },
  (table) => [
    unique("notifications_key_unique").on(table.uniqueKey),
    check("notifications_kind_check", oneOf(table.kind, notificationKinds)),
    index("notifications_recipient_index").on(table.recipientId, table.createdAt),
    index("notifications_booking_index").on(table.bookingId),
    index("notifications_message_index").on(table.messageId),
    // The clean-up finds old ones.
    index("notifications_created_index").on(table.createdAt),
  ],
);

/**
 * A notification on one channel (spec 7, 3.7): queued, being sent, sent,
 * failed, or skipped with the reason, so "nobody told me" can be checked.
 * No text is stored: it is made again from the notification when sent.
 */
export const notificationDeliveries = pgTable(
  "notification_deliveries",
  {
    id: id(),
    notificationId: uuid()
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    channel: text().notNull(),
    status: text().notNull(),
    attempts: integer().notNull().default(0),
    /** Queued: when to send. Sending: when the worker's lease runs out. */
    nextAttemptAt: at(),
    /** The provider's reference, such as Expo's push ticket ID. */
    providerRef: text(),
    /** Why it was skipped or failed, such as `no_device` or `interrupted`. */
    reason: text(),
    sentAt: at(),
    ...timestamps,
  },
  (table) => [
    unique("notification_deliveries_channel_unique").on(table.notificationId, table.channel),
    check("notification_deliveries_channel_check", oneOf(table.channel, channels)),
    check("notification_deliveries_status_check", oneOf(table.status, deliveryStatuses)),
    check(
      "notification_deliveries_next_check",
      sql`(${table.status} in ('queued', 'sending')) = (${table.nextAttemptAt} is not null)`,
    ),
    // The worker takes those due.
    index("notification_deliveries_due_index")
      .on(table.nextAttemptAt)
      .where(sql`${table.status} in ('queued', 'sending')`),
  ],
);

/**
 * A notification that waits for a moment (spec 7, 3.3): the halfway and
 * pay reminders for now. At `run_at` the worker checks it still applies,
 * then sends it or drops it, and sets `done_at`. The key makes scheduling
 * the same thing twice a no-op.
 */
export const scheduledNotifications = pgTable(
  "scheduled_notifications",
  {
    id: id(),
    key: text().notNull(),
    kind: text().notNull(),
    bookingId: uuid().references(() => bookings.id, { onDelete: "cascade" }),
    runAt: at().notNull(),
    doneAt: at(),
    ...timestamps,
  },
  (table) => [
    unique("scheduled_notifications_key_unique").on(table.key),
    check("scheduled_notifications_kind_check", oneOf(table.kind, notificationKinds)),
    index("scheduled_notifications_due_index")
      .on(table.runAt)
      .where(sql`${table.doneAt} is null`),
  ],
);

/**
 * The Expo push token of a signed-in device (spec 7, section 6): one per
 * session, gone when the session ends or the token is reported invalid.
 */
export const pushTokens = pgTable(
  "push_tokens",
  {
    id: id(),
    sessionId: uuid()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text().notNull(),
    token: text().notNull(),
    ...timestamps,
  },
  (table) => [
    unique("push_tokens_session_unique").on(table.sessionId),
    check("push_tokens_platform_check", sql`${table.platform} in ('ios', 'android', 'web')`),
    index("push_tokens_user_index").on(table.userId),
  ],
);
