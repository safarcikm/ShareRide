import { schema } from "@shareride/db";
import { conversationWindow, defaultChatSettings, type ChatSettings } from "@shareride/domain";
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
