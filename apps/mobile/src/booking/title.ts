import type { Booking } from "@shareride/contracts";
import {
  capitalised,
  formatClock,
  formatDay,
  formatDayAndMonth,
  type Locale,
  type Translate,
} from "@shareride/i18n";
import { compareDays, dayOf } from "@/lib/days";
import { leavesText } from "@/my-rides/need-texts";
import { firstNameOf } from "@/people/texts";
import { heldBack } from "@/reviews/held-back";
import { onTripDay } from "@/trip-day/passenger";
import { statusKey } from "./status";
import { answerUntilText, seatHeldText } from "./texts";

// The head of a booked seat (spec 31, 3.8 items 1 and 2, and 3.9 item 1):
// its title says where the booking stands, one line under it says what
// happens next, and a road shows how far it has come.

export interface BookingTitle {
  /** Small, over the title: the day, where the title is the ride's part. */
  readonly over: string | null;
  readonly title: string;
  /** What happens next; null where the status says it all. */
  readonly line: string | null;
}

/** Whether its passenger can review a completed booking now (spec 8, 3.7). */
export function reviewOpen(t: Translate, booking: Booking, at: Date): boolean {
  const { review } = booking;
  return (
    review !== null &&
    review.mine === null &&
    at.getTime() < new Date(review.closesAt).getTime() &&
    heldBack(t, booking) === null
  );
}

/**
 * The title of a booking's page. For its passenger it is the state: a
 * request sent, a seat to pay for, a seat confirmed, the trip day counting
 * down and then following what the driver says, a ride to review, or how
 * it ended. The page is the passenger's (3.8, item 9); a driver who opens
 * a passenger's booking reads the day and the part, with the status under
 * them.
 */
export function bookingTitle(
  t: Translate,
  locale: Locale,
  booking: Booking,
  at: Date,
): BookingTitle {
  const boardsAt = new Date(booking.board.plannedAt);
  const stop = booking.board.meetingPoint.name[locale];
  const state = t(statusKey(booking));
  if (booking.viewer === "driver") {
    return {
      over: capitalised(formatDay(boardsAt, locale), locale),
      title: t("ride.fromTo", { from: stop, to: booking.alight.meetingPoint.name[locale] }),
      line: state,
    };
  }
  const driver = firstNameOf(t, booking.driver);
  const time = formatClock(boardsAt);
  const said = (title: string, line: string | null = null): BookingTitle => ({
    over: null,
    title,
    line,
  });
  switch (booking.status) {
    case "requested":
      return said(
        t("booking.requestSentTitle"),
        booking.requestExpiresAt === null
          ? null
          : answerUntilText(t, driver, new Date(booking.requestExpiresAt), at),
      );
    case "accepted": {
      const due = booking.paymentDueAt === null ? null : new Date(booking.paymentDueAt);
      return said(
        booking.trip.bookingMode === "approval"
          ? t("needs.saidYes", { name: driver })
          : t("needs.payToKeep"),
        due === null ? null : seatHeldText(t, due, at),
      );
    }
    case "confirmed": {
      if (!onTripDay(booking)) {
        return said(
          t("booking.confirmed"),
          t("booking.pickUp", {
            day: capitalised(formatDay(boardsAt, locale), locale),
            driver,
            time,
            stop,
          }),
        );
      }
      const today = compareDays(dayOf(boardsAt), dayOf(at)) === 0;
      return said(
        booking.tripDay === null || booking.tripDay.driverCheckedInAt === null
          ? leavesText(t, boardsAt, at)
          : t("tripDay.otherHere", { name: driver }),
        t(today ? "booking.todayFrom" : "booking.timeFrom", { time, stop }),
      );
    }
    case "completed": {
      const { review } = booking;
      if (review === null || !reviewOpen(t, booking, at)) return said(state);
      const closesAt = new Date(review.closesAt);
      return said(
        t("review.title"),
        t("review.closesOn", {
          date: formatDayAndMonth(closesAt, locale),
          time: formatClock(closesAt),
        }),
      );
    }
    default:
      return said(state);
  }
}

/**
 * The road of a booked seat, for its passenger: Asked, Confirmed, Trip day,
 * Done, and which step the car stands on. A ride booked instantly was
 * never asked for, so its road starts at Confirmed, and has none before
 * it is paid. A booking that was declined, expired, cancelled or a
 * no-show leads nowhere and has no road.
 */
export function bookingRoad(
  t: Translate,
  booking: Booking,
): { readonly steps: readonly string[]; readonly current: number } | null {
  if (booking.viewer !== "passenger") return null;
  const asked = booking.trip.bookingMode === "approval";
  const reached =
    booking.status === "requested" || booking.status === "accepted"
      ? 0
      : booking.status === "confirmed"
        ? booking.tripDay !== null && booking.tripDay.phase !== "upcoming"
          ? 2
          : 1
        : booking.status === "completed"
          ? 3
          : null;
  if (reached === null || (!asked && reached === 0)) return null;
  const steps = [t("road.asked"), t("road.confirmed"), t("road.tripDay"), t("road.done")];
  return asked ? { steps, current: reached } : { steps: steps.slice(1), current: reached - 1 };
}
