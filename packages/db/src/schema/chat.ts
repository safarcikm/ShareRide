import { defaultChatSettings } from "@shareride/domain";
import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { bookings } from "./bookings.ts";
import { at, id, oneOf, timestamps } from "./columns.ts";
import { users } from "./users.ts";

/**
 * One per booking, between its driver and passenger only (spec 7, R7.1).
 * It opens when the booking is confirmed and is read-only from `closes_at`,
 * 7 days after the trip's planned arrival. Deleted with its messages 12
 * months after the trip's planned arrival (privacy register: messages).
 */
export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    bookingId: uuid()
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    openedAt: at().notNull(),
    closesAt: at().notNull(),
    ...timestamps,
  },
  (table) => [
    unique("conversations_booking_unique").on(table.bookingId),
    check("conversations_window_check", sql`${table.openedAt} < ${table.closesAt}`),
  ],
);

export const messageKinds = ["text", "quick", "system"] as const;

/**
 * A message in a conversation (R7.2): text as written, or a quick message or
 * system line stored as a key with its parameters, put into words in the
 * reader's language. Its text never leaves this table, apart from the push
 * to its reader (R7.9).
 */
export const messages = pgTable(
  "messages",
  {
    id: id(),
    conversationId: uuid()
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    /** Empty for a system line. */
    senderId: uuid().references(() => users.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    /** A text message's text. */
    body: text(),
    /** A quick message's or system line's key. */
    key: text(),
    /** Such as `{ "minutes": 10 }` for "I'm running 10 minutes late". */
    params: jsonb().$type<Readonly<Record<string, string | number | boolean>>>(),
    /** Made by the app for each message, so a retry never sends it twice. */
    clientId: uuid(),
    sentAt: at().notNull(),
    /** When the other person read it ("Seen"); never set on a system line. */
    readAt: at(),
    /**
     * When its sender's data was erased (spec 11, 3.5): the other person sees
     * "Message deleted", and what it said is gone, unless a report covers the
     * conversation; then only the operator reads it, until the report's own
     * time is over (spec 9, section 7).
     */
    erasedAt: at(),
    ...timestamps,
  },
  (table) => [
    // Also finds a person's messages by client ID, in any conversation.
    unique("messages_client_unique").on(table.senderId, table.clientId, table.conversationId),
    check("messages_kind_check", oneOf(table.kind, messageKinds)),
    // As sent, or, once erased, either as sent or emptied; ShareRide's lines are never erased.
    check(
      "messages_body_check",
      sql`(${table.kind} = 'text') = (${table.body} is not null) and char_length(${table.body}) between 1 and ${sql.raw(String(defaultChatSettings.messageMaxLength))} or (${table.erasedAt} is not null and ${table.body} is null)`,
    ),
    check(
      "messages_key_check",
      sql`(${table.erasedAt} is null or ${table.kind} <> 'system') and ((${table.kind} = 'text') = (${table.key} is null) or (${table.erasedAt} is not null and ${table.key} is null and ${table.params} is null))`,
    ),
    check(
      "messages_sender_check",
      sql`(${table.kind} = 'system') = (${table.senderId} is null) and (${table.kind} = 'system') = (${table.clientId} is null)`,
    ),
    check("messages_read_check", sql`${table.kind} <> 'system' or ${table.readAt} is null`),
    // A conversation's messages, newest first, and its unread count.
    index("messages_conversation_index").on(table.conversationId, table.sentAt, table.id),
    // The rate limit counts a person's messages in the last minute (R7.5).
    index("messages_sender_index").on(table.senderId, table.sentAt),
  ],
);
