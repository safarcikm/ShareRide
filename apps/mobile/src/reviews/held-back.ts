import type { Booking } from "@shareride/contracts";
import type { Translate } from "@shareride/i18n";
import { otherPerson } from "@/chat/texts";

/**
 * Why the viewer can't review a completed booking yet, or at all, though
 * its 14 days are open (spec 8, 3.7): the other person has left ShareRide,
 * or a report on the booking waits to be decided. The server refuses the
 * same; the app says so before anyone picks stars. Null when nothing holds
 * the review back. A person still leaving shows by name, so only the
 * server can tell them apart.
 */
export function heldBack(t: Translate, booking: Booking): string | null {
  const by = heldBackBy(booking);
  if (by === null) return null;
  return t(by === "personLeft" ? "review.personLeft" : "review.reportOpen");
}

function heldBackBy(booking: Booking): "personLeft" | "reportOpen" | null {
  if (otherPerson(booking).firstName === null) return "personLeft";
  if (booking.dispute !== null && booking.dispute.outcome === null) return "reportOpen";
  return null;
}

/**
 * Whether the viewer can rate the other person on a booking at `at` (spec
 * 8, 3.7): it is completed, its 14 days still run, the viewer has sent
 * nothing, and nothing holds the review back. The one rule for the tag in
 * My rides (spec 31, 3.10), a booked seat's title and main button (3.8)
 * and the button under a review.
 */
export function canRate(booking: Booking, at: Date): boolean {
  const { review } = booking;
  if (review === null || review.mine !== null || at >= new Date(review.closesAt)) return false;
  return heldBackBy(booking) === null;
}
