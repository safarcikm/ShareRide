import { schema } from "@shareride/db";
import {
  conversationWindow,
  defaultChatSettings,
  type ChatSettings,
  type SystemLine,
} from "@shareride/domain";
import { eq } from "drizzle-orm";
import { stopsOf, type Transaction } from "../bookings/seats.ts";

const { conversations, messages } = schema;

/**
 * Opens a booking's conversation as it is confirmed (R7.1), in the same
 * transaction, with its first line. It closes 7 days after the trip's planned
 * arrival. A booking already confirmed keeps the conversation it has.
 */
export async function openConversation(
  tx: Transaction,
  booking: { readonly id: string; readonly tripId: string },
  now: Date,
  settings: ChatSettings = defaultChatSettings,
): Promise<void> {
  const stops = await stopsOf(tx, booking.tripId);
  const arrivesAt = stops.at(-1)?.plannedAt;
  if (arrivesAt === null || arrivesAt === undefined) {
    throw new Error("A booked trip has the time of its last stop.");
  }
  const window = conversationWindow({ confirmedAt: now, arrivesAt }, settings);
  const [opened] = await tx
    .insert(conversations)
    .values({ bookingId: booking.id, openedAt: window.opensAt, closesAt: window.closesAt })
    .onConflictDoNothing()
    .returning({ id: conversations.id });
  if (opened === undefined) return;
  await tx
    .insert(messages)
    .values({ conversationId: opened.id, kind: "system", key: "opened", sentAt: now });
}

/**
 * Writes what happened to the booking into its conversation, if it has one
 * (spec 7, 3.1, item 3). Each reader sees it in their own words; it tells
 * nobody, as the worker skips system lines.
 */
export async function addSystemLine(
  tx: Transaction,
  bookingId: string,
  line: SystemLine,
  now: Date,
): Promise<void> {
  const [conversation] = await tx
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.bookingId, bookingId));
  if (conversation === undefined) return;
  const { key, ...params } = line;
  await tx.insert(messages).values({
    conversationId: conversation.id,
    kind: "system",
    key,
    params: Object.keys(params).length === 0 ? null : params,
    sentAt: now,
  });
}
