import type { ChatMessage, Conversation, SendMessageBody } from "@shareride/contracts";
import { messagesPageSize } from "@shareride/contracts";
import { schema, type Database } from "@shareride/db";
import {
  canWrite,
  checkMessage,
  err,
  ok,
  type ChatSettings,
  type MessageBody,
  type MessageProblem,
  type QuickMessage,
  type CancelReason,
  type Result,
  type TripRole,
} from "@shareride/domain";
import { and, desc, eq, gt, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import type { BookingService } from "../bookings/index.ts";
import type { Queryable } from "../bookings/seats.ts";
import { recordEvents } from "../notifications/outbox.ts";

const { bookings, conversations, messages, trips, users } = schema;

export type ChatError =
  | { readonly code: "not_found" }
  /** No conversation yet: the booking is not confirmed (R7.1). */
  | { readonly code: "not_confirmed" };

export type PageError = ChatError | { readonly code: "message_not_found" };

/**
 * A client ID names one message: one conversation's, or one message to all
 * of a trip's passengers. Used again for another, it is refused, so it
 * cannot pass for a retry or count once towards the limit (R7.5).
 */
export type ClientIdReused = { readonly code: "client_id_reused" };

export type SendError =
  | ChatError
  | { readonly code: "chat_closed" }
  | { readonly code: "too_many_messages" }
  | ClientIdReused
  | MessageProblem;

export type MessageAllError =
  | { readonly code: "not_found" }
  | { readonly code: "too_many_messages" }
  | ClientIdReused
  | MessageProblem;

export interface MessagesPage {
  readonly conversation: Conversation;
  readonly messages: ChatMessage[];
  readonly hasMore: boolean;
}

export interface ChatService {
  /** The conversations of the person's bookings and trips, the latest message first. */
  conversations(userId: string): Promise<{ conversations: Conversation[]; unread: number }>;
  /** A page of a conversation, newest first, before the message `before`. */
  messages(
    userId: string,
    bookingId: string,
    before: string | undefined,
  ): Promise<Result<MessagesPage, PageError>>;
  /** `created` is false for a retry with the same client ID. */
  send(
    userId: string,
    bookingId: string,
    body: SendMessageBody,
  ): Promise<Result<{ readonly message: ChatMessage; readonly created: boolean }, SendError>>;
  /** Marks the other person's messages read, up to and with `upTo`. */
  read(userId: string, bookingId: string, upTo: string): Promise<Result<null, PageError>>;
  /** The same message into every confirmed passenger's conversation (R7.4). */
  messageAll(
    driverId: string,
    tripId: string,
    body: SendMessageBody,
  ): Promise<Result<{ readonly sent: number }, MessageAllError>>;
}

type ConversationRow = typeof conversations.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

const minuteMs = 60_000;

/** A stored system line, as the person reading it sees it: a cancellation is mine or theirs. */
function systemLineOf(row: MessageRow, viewer: TripRole): NonNullable<ChatMessage["system"]> {
  switch (row.key) {
    case "opened":
      return { key: "opened" };
    case "departure_changed":
      return {
        key: "departure_changed",
        from: String(row.params?.["from"]),
        to: String(row.params?.["to"]),
      };
    case "cancelled":
      return {
        key: "cancelled",
        by: row.params?.["by"] === viewer ? "me" : "them",
        reason: row.params?.["reason"] as CancelReason,
        // Lines from before notes were stored have none.
        note: typeof row.params?.["note"] === "string" ? row.params["note"] : "",
        wholeTrip: row.params?.["wholeTrip"] === true,
      };
    default:
      throw new Error(`No such system line: ${String(row.key)}.`);
  }
}

/** A message as `viewerId`, the booking's passenger or driver, sees it. */
function present(row: MessageRow, viewerId: string, viewer: TripRole): ChatMessage {
  const from = row.senderId === null ? "system" : row.senderId === viewerId ? "me" : "them";
  const mine = from === "me";
  return {
    id: row.id,
    from,
    kind: row.kind as ChatMessage["kind"],
    text: row.kind === "text" ? row.body : null,
    quick: row.kind === "quick" ? quickOf(row) : null,
    system: row.kind === "system" ? systemLineOf(row, viewer) : null,
    clientId: mine ? row.clientId : null,
    sentAt: row.sentAt.toISOString(),
    readAt: mine ? (row.readAt?.toISOString() ?? null) : null,
  };
}

/** A stored quick message, as the app and the push show it. */
export function quickOf(row: Pick<MessageRow, "key" | "params">): QuickMessage {
  const minutes = row.params?.["minutes"];
  return row.key === "late"
    ? ({ key: "late", minutes } as QuickMessage)
    : ({ key: row.key } as QuickMessage);
}

/** The columns a checked message is stored in. */
function columnsOf(body: MessageBody): Pick<MessageRow, "kind" | "body" | "key" | "params"> {
  if (body.kind === "text") return { kind: "text", body: body.text, key: null, params: null };
  const { quick } = body;
  return {
    kind: "quick",
    body: null,
    key: quick.key,
    params: quick.key === "late" ? { minutes: quick.minutes } : null,
  };
}

function inputOf(body: SendMessageBody) {
  return "text" in body ? { text: body.text } : { quick: body.quick };
}

/** Before or after a message, in the order messages are shown. */
const before = (row: Pick<MessageRow, "sentAt" | "id">) =>
  sql`(${messages.sentAt}, ${messages.id}) < (${row.sentAt}, ${row.id})`;
const upToAndWith = (row: Pick<MessageRow, "sentAt" | "id">) =>
  sql`(${messages.sentAt}, ${messages.id}) <= (${row.sentAt}, ${row.id})`;

/** The other person's messages that `userId` has not read; system lines are never unread. */
const unreadBy = (userId: string): SQL | undefined =>
  and(isNotNull(messages.senderId), ne(messages.senderId, userId), isNull(messages.readAt));

export function createChatService(dependencies: {
  readonly db: Database;
  readonly clock: () => Date;
  readonly bookings: Pick<BookingService, "bookingsOf">;
  readonly settings: ChatSettings;
}): ChatService {
  const { db, clock, settings } = dependencies;

  /** The booking's conversation, for its passenger or driver, and which of them is asking. */
  async function access(
    q: Queryable,
    userId: string,
    bookingId: string,
  ): Promise<
    Result<{ readonly conversation: ConversationRow; readonly viewer: TripRole }, ChatError>
  > {
    const [row] = await q
      .select({
        passengerId: bookings.passengerId,
        driverId: trips.driverId,
        conversation: conversations,
      })
      .from(bookings)
      .innerJoin(trips, eq(trips.id, bookings.tripId))
      .leftJoin(conversations, eq(conversations.bookingId, bookings.id))
      .where(eq(bookings.id, bookingId));
    if (row === undefined || (row.passengerId !== userId && row.driverId !== userId)) {
      return err({ code: "not_found" });
    }
    if (row.conversation === null) return err({ code: "not_confirmed" });
    return ok({
      conversation: row.conversation,
      viewer: row.passengerId === userId ? "passenger" : "driver",
    });
  }

  async function messageIn(conversationId: string, messageId: string) {
    const [row] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.id, messageId)));
    return row;
  }

  /** The conversations as `userId` sees them, in the order given. */
  async function summaries(userId: string, rows: readonly ConversationRow[]) {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const [booked, unread, last] = await Promise.all([
      dependencies.bookings.bookingsOf(
        userId,
        rows.map((row) => row.bookingId),
      ),
      db
        .select({ conversationId: messages.conversationId, count: sql<number>`count(*)::int` })
        .from(messages)
        .where(and(inArray(messages.conversationId, ids), unreadBy(userId)))
        .groupBy(messages.conversationId),
      db
        .selectDistinctOn([messages.conversationId])
        .from(messages)
        .where(inArray(messages.conversationId, ids))
        .orderBy(messages.conversationId, desc(messages.sentAt), desc(messages.id)),
    ]);
    const now = clock();
    return rows.flatMap((row): Conversation[] => {
      const booking = booked.find((found) => found.id === row.bookingId);
      if (booking === undefined) return [];
      const lastMessage = last.find((message) => message.conversationId === row.id);
      return [
        {
          booking,
          closesAt: row.closesAt.toISOString(),
          canWrite: canWrite({ opensAt: row.openedAt, closesAt: row.closesAt }, now),
          unread: unread.find((count) => count.conversationId === row.id)?.count ?? 0,
          lastMessage:
            lastMessage === undefined ? null : present(lastMessage, userId, booking.viewer),
        },
      ];
    });
  }

  /**
   * The person's messages with different client IDs in the last minute
   * (R7.5): a message to all passengers is one, since a client ID is never
   * used for two messages (`ClientIdReused`).
   */
  async function sentLastMinute(q: Queryable, userId: string, now: Date) {
    const [row] = await q
      .select({ count: sql<number>`count(distinct ${messages.clientId})::int` })
      .from(messages)
      .where(
        and(eq(messages.senderId, userId), gt(messages.sentAt, new Date(now.getTime() - minuteMs))),
      );
    return row?.count ?? 0;
  }

  /** Waits for the person's other sends, so two at once cannot pass the limit together. */
  async function lockSender(q: Queryable, userId: string) {
    await q.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
  }

  return {
    async conversations(userId) {
      const rows = await db
        .select({ conversation: conversations })
        .from(conversations)
        .innerJoin(bookings, eq(bookings.id, conversations.bookingId))
        .innerJoin(trips, eq(trips.id, bookings.tripId))
        .where(or(eq(bookings.passengerId, userId), eq(trips.driverId, userId)));
      const found = await summaries(
        userId,
        rows.map((row) => row.conversation),
      );
      const latest = (conversation: Conversation) =>
        Date.parse(conversation.lastMessage?.sentAt ?? conversation.booking.createdAt);
      found.sort((a, b) => latest(b) - latest(a));
      return {
        conversations: found,
        unread: found.reduce((total, conversation) => total + conversation.unread, 0),
      };
    },

    async messages(userId, bookingId, beforeId) {
      const found = await access(db, userId, bookingId);
      if (!found.ok) return found;
      const { conversation, viewer } = found.value;
      let older: SQL | undefined;
      if (beforeId !== undefined) {
        const from = await messageIn(conversation.id, beforeId);
        if (from === undefined) return err({ code: "message_not_found" });
        older = before(from);
      }
      const [rows, [summary]] = await Promise.all([
        db
          .select()
          .from(messages)
          .where(and(eq(messages.conversationId, conversation.id), older))
          .orderBy(desc(messages.sentAt), desc(messages.id))
          .limit(messagesPageSize + 1),
        summaries(userId, [conversation]),
      ]);
      if (summary === undefined) return err({ code: "not_found" });
      return ok({
        conversation: summary,
        messages: rows.slice(0, messagesPageSize).map((row) => present(row, userId, viewer)),
        hasMore: rows.length > messagesPageSize,
      });
    },

    async send(userId, bookingId, body) {
      const found = await access(db, userId, bookingId);
      if (!found.ok) return found;
      const { conversation, viewer } = found.value;
      // A retry gets what was sent, even once the conversation has closed.
      const earlier = async (q: Queryable): Promise<Result<MessageRow | null, ClientIdReused>> => {
        const rows = await q
          .select()
          .from(messages)
          .where(and(eq(messages.senderId, userId), eq(messages.clientId, body.clientId)));
        if (rows.length === 0) return ok(null);
        const here = rows.find((row) => row.conversationId === conversation.id);
        return here === undefined ? err({ code: "client_id_reused" }) : ok(here);
      };
      const retried = await earlier(db);
      if (!retried.ok) return retried;
      if (retried.value !== null) {
        return ok({ message: present(retried.value, userId, viewer), created: false });
      }
      const checked = checkMessage(inputOf(body), settings);
      if (!checked.ok) return checked;

      return db.transaction(async (tx) => {
        await lockSender(tx, userId);
        const now = clock();
        if (!canWrite({ opensAt: conversation.openedAt, closesAt: conversation.closesAt }, now)) {
          return err({ code: "chat_closed" });
        }
        const again = await earlier(tx);
        if (!again.ok) return again;
        if (again.value !== null) {
          return ok({ message: present(again.value, userId, viewer), created: false });
        }
        if ((await sentLastMinute(tx, userId, now)) >= settings.rateLimitPerMinute) {
          return err({ code: "too_many_messages" });
        }
        const [created] = await tx
          .insert(messages)
          .values({
            conversationId: conversation.id,
            senderId: userId,
            clientId: body.clientId,
            sentAt: now,
            ...columnsOf(checked.value),
          })
          .returning();
        if (created === undefined) throw new Error("The message was not stored.");
        await recordEvents(tx, [{ type: "MessageSent", messageId: created.id }], now);
        return ok({ message: present(created, userId, viewer), created: true });
      });
    },

    async read(userId, bookingId, upTo) {
      const found = await access(db, userId, bookingId);
      if (!found.ok) return found;
      const { conversation } = found.value;
      const message = await messageIn(conversation.id, upTo);
      if (message === undefined) return err({ code: "message_not_found" });
      await db
        .update(messages)
        .set({ readAt: clock() })
        .where(
          and(eq(messages.conversationId, conversation.id), unreadBy(userId), upToAndWith(message)),
        );
      return ok(null);
    },

    async messageAll(driverId, tripId, body) {
      const [trip] = await db
        .select({ id: trips.id })
        .from(trips)
        .where(and(eq(trips.id, tripId), eq(trips.driverId, driverId), ne(trips.status, "draft")));
      if (trip === undefined) return err({ code: "not_found" });
      const checked = checkMessage(inputOf(body), settings);
      if (!checked.ok) return checked;

      return db.transaction(async (tx) => {
        await lockSender(tx, driverId);
        const now = clock();
        const earlier = await tx
          .select({ tripId: bookings.tripId })
          .from(messages)
          .innerJoin(conversations, eq(conversations.id, messages.conversationId))
          .innerJoin(bookings, eq(bookings.id, conversations.bookingId))
          .where(and(eq(messages.senderId, driverId), eq(messages.clientId, body.clientId)));
        if (earlier.some((row) => row.tripId !== tripId)) return err({ code: "client_id_reused" });
        // A retry sends nothing more, not even to a passenger confirmed since.
        if (earlier.length > 0) return ok({ sent: earlier.length });
        const open = (
          await tx
            .select({ conversation: conversations })
            .from(conversations)
            .innerJoin(bookings, eq(bookings.id, conversations.bookingId))
            .where(and(eq(bookings.tripId, tripId), eq(bookings.status, "confirmed")))
        )
          .map((row) => row.conversation)
          .filter((row) => canWrite({ opensAt: row.openedAt, closesAt: row.closesAt }, now));
        if (open.length === 0) return ok({ sent: 0 });
        if ((await sentLastMinute(tx, driverId, now)) >= settings.rateLimitPerMinute) {
          return err({ code: "too_many_messages" });
        }
        const created = await tx
          .insert(messages)
          .values(
            open.map((row) => ({
              conversationId: row.id,
              senderId: driverId,
              clientId: body.clientId,
              sentAt: now,
              ...columnsOf(checked.value),
            })),
          )
          .onConflictDoNothing()
          .returning({ id: messages.id });
        await recordEvents(
          tx,
          created.map((message) => ({ type: "MessageSent", messageId: message.id })),
          now,
        );
        return ok({ sent: open.length });
      });
    },
  };
}
