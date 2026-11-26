import type { Booking } from "@shareride/contracts";
import type { Locale, MessageKey } from "@shareride/i18n";
import type { Href } from "expo-router";
import type { TagKind } from "@/components/tag";
import { compareDays, dayOf, isoDay } from "@/lib/days";
import { resultsHref } from "@/search/results-href";

// How a booking's status reads for its passenger, on the booking screen and
// in My bookings (spec 5, 3.4 and 3.6).

/** A request the passenger withdrew before the driver answered (R5.8). */
export const isWithdrawn = (booking: Booking) =>
  booking.status === "cancelled" && booking.withdrawn;

/** A request declined because the driver cancelled the trip (spec 6, 3.3), which reads as cancelled. */
const declinedWithTrip = (booking: Booking) =>
  booking.status === "declined" && booking.cancellation !== null;

export function statusKey(booking: Booking): MessageKey {
  if (isWithdrawn(booking)) return "booking.status.withdrawn";
  return declinedWithTrip(booking)
    ? "booking.status.cancelled"
    : `booking.status.${booking.status}`;
}

/**
 * What a status tag's colour says (spec 31, 3.2, rule 6, and decision 10):
 * blue is waiting, amber is yours and now ("Waiting for payment"), moss is
 * good news and red is a problem. A booking that was declined, expired,
 * cancelled or withdrawn asks nothing of anyone, so its tag is quiet.
 */
const statusTags: Record<Booking["status"], TagKind> = {
  requested: "info",
  accepted: "warning",
  confirmed: "positive",
  declined: "plain",
  expired: "plain",
  cancelled: "plain",
  completed: "positive",
  no_show: "problem",
};

/** The status tag's look. */
export const statusTag = (booking: Booking): TagKind => statusTags[booking.status];

/**
 * When the booking's own page asks its passenger to turn on notifications or
 * add an email (spec 7, 3.6.2), and for which occasion: a request the driver
 * said yes to, waiting for payment or confirmed (a free one is at once,
 * R5.11); or an instant booking once confirmed, which may be paid here after
 * leaving Check and pay, and shares the finish screen's occasion.
 */
export function promptOccasion(booking: Booking): string | null {
  if (booking.viewer !== "passenger") return null;
  if (booking.trip.bookingMode === "approval") {
    return booking.status === "accepted" || booking.status === "confirmed"
      ? `accepted:${booking.id}`
      : null;
  }
  return booking.status === "confirmed" ? `booked:${booking.id}` : null;
}

/** Someone other than the passenger cancelled it: the driver or ShareRide (spec 6). */
const cancelledForThem = (booking: Booking) =>
  booking.status === "cancelled" &&
  booking.cancellation !== null &&
  booking.cancellation.by !== "passenger";

/**
 * Declined, expired and withdrawn bookings, and those someone else
 * cancelled, offer the same search again.
 */
export const offersSearchAgain = (booking: Booking) =>
  booking.status === "declined" ||
  booking.status === "expired" ||
  isWithdrawn(booking) ||
  cancelledForThem(booking);

/**
 * An accepted or confirmed booking its passenger or driver can cancel
 * (spec 6, 3.4 and 3.5), until the planned time at the boarding stop; then
 * the trip day takes over (spec 8). A request is withdrawn or declined
 * instead.
 */
export const canCancel = (booking: Booking, at: Date) =>
  (booking.status === "accepted" || booking.status === "confirmed") &&
  at.getTime() < new Date(booking.board.plannedAt).getTime();

/**
 * Search results for the same part and seats, on the same day while that day
 * is still to come, otherwise on any day (spec 5, 3.3 item 5).
 */
export function searchAgainHref(booking: Booking, locale: Locale, today: Date): Href {
  const day = dayOf(new Date(booking.board.plannedAt));
  const end = (stop: Booking["board"]) => ({
    id: stop.meetingPoint.id,
    name: stop.meetingPoint.name,
  });
  return resultsHref(
    {
      from: end(booking.board),
      to: end(booking.alight),
      date: compareDays(day, dayOf(today)) >= 0 ? isoDay(day) : null,
      seats: booking.seats,
    },
    locale,
  );
}
