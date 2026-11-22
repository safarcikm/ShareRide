import type { CallFailure } from "@shareride/api-client";
import type { Booking, CancellationTerms } from "@shareride/contracts";
import {
  cancelReasonText,
  formatClock,
  formatDuration,
  formatMoney,
  type Locale,
  type Translate,
} from "@shareride/i18n";
import { errorText } from "@/auth/errors";
import { compareDays, dayOf } from "@/lib/days";
import { firstNameOf } from "@/people/texts";

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
    name: firstNameOf(t, accepted.passenger),
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
    case "stops_changed":
      return t("booking.stopsChanged");
    case "trip_limit_reached":
      return t("booking.tripLimitReached");
    case "own_trip":
      return t("trip.own");
    case "not_found":
      return t("trip.notFound");
    default:
      return errorText(t, failure);
  }
}

/**
 * What cancelling does to the money, before confirming (spec 6, 3.5.2):
 * all of it back, none, or nothing to give back, unpaid or free.
 */
export function refundText(
  t: Translate,
  locale: Locale,
  booking: Booking,
  terms: CancellationTerms,
): string {
  if (booking.total.amount === 0) return t("booking.nothingToRefund");
  const name = firstNameOf(t, booking.passenger);
  // Paid to the driver in person (rule M6): nothing went through the app.
  if (booking.payment === "in_person") {
    return booking.viewer === "driver"
      ? t("booking.driverNothingInPerson", { name })
      : t("booking.nothingToRefundInPerson");
  }
  if (booking.status === "accepted") {
    return booking.viewer === "driver"
      ? t("booking.driverNothingPaid", { name })
      : t("booking.nothingPaid");
  }
  const amount = formatMoney(terms.refund, locale);
  // A driver's cancellation always refunds in full (rule M2).
  if (booking.viewer === "driver") return t("booking.driverRefund", { name, amount });
  return terms.refund.amount > 0
    ? t("booking.fullRefund", { amount })
    : t("booking.noRefund", {
        time: formatDuration(booking.cancellationRules.freeUntilMinutes * 60, locale),
      });
}

/**
 * A cancelled booking's outcome for its passenger, or a request's declined
 * because the driver cancelled the trip: who cancelled what and why, the
 * refund if there was one, and whether it shows on their profile.
 */
export function cancellationTexts(
  t: Translate,
  locale: Locale,
  booking: Booking,
): {
  readonly said: string | null;
  /** The driver's note, as written, if they gave one. */
  readonly note: string | null;
  readonly refund: string | null;
  readonly counts: boolean;
} | null {
  const { cancellation } = booking;
  if (cancellation === null) return null;
  const reason = cancellation.reason === null ? null : cancelReasonText(t, cancellation.reason);
  // The operator gives no reason; a passenger or driver always does. A
  // driver's absence that stood is ShareRide's doing (spec 8, 3.4), and so
  // is a no-show ShareRide found was the driver leaving without them
  // (decision 4), which cancels the same way.
  const said =
    cancellation.by === "operator"
      ? t("booking.cancelledByOperator")
      : cancellation.reason === "driver_absent"
        ? t(
            booking.dispute?.outcome === "left_behind"
              ? "booking.cancelledLeftBehind"
              : "booking.cancelledDriverAbsent",
            { name: firstNameOf(t, booking.driver) },
          )
        : reason === null
          ? null
          : cancellation.by === "passenger"
            ? t("booking.cancelledByYou", { reason })
            : t(cancellation.wholeTrip ? "booking.tripCancelledBy" : "booking.cancelledByOther", {
                name: firstNameOf(t, booking.driver),
                reason,
              });
  return {
    said,
    note: cancellation.note === "" ? null : t("booking.driverNote", { note: cancellation.note }),
    refund:
      cancellation.refund.amount > 0
        ? t("booking.refundOnItsWay", { amount: formatMoney(cancellation.refund, locale) })
        : null,
    counts: cancellation.countsOnReliability === true,
  };
}
