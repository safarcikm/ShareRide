import type { CallFailure } from "@shareride/api-client";
import type { Booking } from "@shareride/contracts";
import { formatClock, type Translate } from "@shareride/i18n";
import { errorText } from "@/auth/errors";
import { compareDays, dayOf } from "@/lib/days";

// Booking texts that depend on the answer or the clock (spec 5, section 8).

/**
 * A deadline as a clock time, with "tomorrow" when it falls on the next day
 * in Iceland. Request and payment deadlines are never more than 12 hours
 * away, so no other day is needed.
 */
function onDay(deadline: Date, at: Date): { readonly time: string; readonly tomorrow: boolean } {
  return { time: formatClock(deadline), tomorrow: compareDays(dayOf(deadline), dayOf(at)) > 0 };
}

/** "Request sent. Anna has until 22:00 to answer." */
export function requestSentText(t: Translate, driver: string, deadline: Date, at: Date): string {
  const { time, tomorrow } = onDay(deadline, at);
  return t(tomorrow ? "booking.requestSentTomorrow" : "booking.requestSent", { driver, time });
}

/** "Anna has until 22:00 to answer.", under Request sent (spec 16, 3.7, item 5). */
export function answerUntilText(t: Translate, driver: string, deadline: Date, at: Date): string {
  const { time, tomorrow } = onDay(deadline, at);
  return t(tomorrow ? "booking.answerByTomorrow" : "booking.answerBy", { driver, time });
}

/** "Pay by 12:30 to keep your seat." */
export function payByText(t: Translate, deadline: Date, at: Date): string {
  const { time, tomorrow } = onDay(deadline, at);
  return t(tomorrow ? "booking.payByTomorrow" : "booking.payBy", { time });
}

/** "Not paid yet. Your seat is held until 12:30.", after a payment that did not finish (spec 16, 3.7). */
export function heldUntilText(t: Translate, deadline: Date, at: Date): string {
  const { time, tomorrow } = onDay(deadline, at);
  return t(tomorrow ? "booking.heldUntilTomorrow" : "booking.heldUntil", { time });
}

/** "Answer by 08:10 tomorrow, or the requests close", for a driver (spec 16, 3.3). */
export function answerByText(t: Translate, deadline: Date, at: Date): string {
  const { time, tomorrow } = onDay(deadline, at);
  return t(tomorrow ? "myRides.answerByTomorrow" : "myRides.answerBy", { time });
}

/**
 * What accepting a request did, for the driver: "Request accepted. Gunna has
 * until 12:30 to pay.", or confirmed at once for a free ride (R5.11).
 */
export function acceptedText(t: Translate, accepted: Booking, at: Date): string {
  if (accepted.paymentDueAt === null) return t("request.acceptedFree");
  const { time, tomorrow } = onDay(new Date(accepted.paymentDueAt), at);
  return t(tomorrow ? "request.acceptedTomorrow" : "request.accepted", {
    name: accepted.passenger.firstName,
    time,
  });
}

/** Why a booking was not made, for the answers that have no screen of their own. */
export function bookErrorText(t: Translate, failure: CallFailure): string {
  switch (failure.error.code) {
    case "overlapping_booking":
      return t("booking.overlapping");
    case "booking_closed":
      return t("trip.closed");
    case "trip_not_bookable":
      return t("booking.notBookable");
    case "own_trip":
      return t("trip.own");
    case "not_found":
      return t("trip.notFound");
    default:
      return errorText(t, failure);
  }
}
