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
  if (otherPerson(booking).firstName === null) return t("review.personLeft");
  if (booking.dispute !== null && booking.dispute.outcome === null) return t("review.reportOpen");
  return null;
}
