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
import { canRate } from "@/reviews/held-back";
import { onTripDay } from "@/trip-day/passenger";
import { statusKey } from "./status";
import { answerUntilText, endedText, seatHeldText } from "./texts";

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

/**
 * The title of a booking's page. For its passenger it is the state: a
 * request sent, a seat to pay for, a seat confirmed, the trip day counting
 * down and then following what the driver says, a ride to review, or how
 * it ended, with why under it. The page is the passenger's (3.8, item 9); a driver who opens
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
      // The passenger said the driver didn't come: the seat stays confirmed
      // until that is decided (R8.2), and the report under the title says
      // where it stands.
      if (booking.dispute?.kind === "driver_absent" && booking.dispute.outcome === null) {
        return said(t("tripDay.driverAbsent"));
      }
      // The ride is over: nobody picks anyone up any more.
      if (booking.tripDay?.phase === "completed") return said(t("booking.confirmed"));
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
      if (review === null || !canRate(booking, at)) return said(state);
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
      // How it ended, and why.
      return said(state, endedText(t, locale, booking));
  }
}

/**
 * The road of a booked seat, for its passenger: Asked, Confirmed, Trip day,
 * Done, and which step the car stands on. A ride booked instantly was
 * never asked for, so its road starts at Confirmed, and has none before
 * it is paid. A booking that was declined, expired, cancelled or a
 * no-show leads nowhere and has no road; nor has a seat still confirmed
 * once its ride is over.
 */
export function bookingRoad(
  t: Translate,
  booking: Booking,
): { readonly steps: readonly string[]; readonly current: number } | null {
  if (booking.viewer !== "passenger") return null;
  const asked = booking.trip.bookingMode === "approval";
  const reached = ((): number | null => {
    switch (booking.status) {
      case "requested":
      case "accepted":
        return 0;
      case "confirmed":
        // Still confirmed once the ride is over, it waits for a report to
        // be decided (R8.2), which says how it ends: no road leads there.
        if (booking.tripDay?.phase === "completed") return null;
        return booking.tripDay?.phase === "trip_day" ? 2 : 1;
      case "completed":
        return 3;
      default:
        return null;
    }
  })();
  if (reached === null || (!asked && reached === 0)) return null;
  const steps = [t("road.asked"), t("road.confirmed"), t("road.tripDay"), t("road.done")];
  return asked ? { steps, current: reached } : { steps: steps.slice(1), current: reached - 1 };
}
