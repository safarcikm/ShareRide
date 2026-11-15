import { openConversation } from "../chat/conversations.ts";
import { recordEvents } from "../notifications/outbox.ts";
import type { Transaction } from "./seats.ts";

/**
 * Everything that follows a booking becoming confirmed, in the transaction
 * that confirms it: a free instant booking, an accepted free request, or a
 * payment that went through (spec 5). The conversation opens (R7.1), and
 * both people are told (spec 7, 3.3).
 */
export async function bookingConfirmed(
  tx: Transaction,
  booking: { readonly id: string; readonly tripId: string },
  now: Date,
): Promise<void> {
  await openConversation(tx, booking, now);
  await recordEvents(tx, [{ type: "BookingConfirmed", bookingId: booking.id }], now);
}
