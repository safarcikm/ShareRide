import type { MyTrip } from "@shareride/contracts";
import {
  cancelReasonText,
  capitalised,
  formatClock,
  formatDay,
  type Locale,
  type Translate,
} from "@shareride/i18n";
import { compareDays, dayOf } from "@/lib/days";
import { onTripDay } from "@/trip-day/driver";

// The head of a ride I drive (spec 31, 3.12, item 1): the title names the
// ride, and one line under it says what it needs from me, or else how it
// stands.

export interface DriverTitle {
  readonly title: string;
  readonly line: string;
}

/**
 * "Your ride to Vík" (in Icelandic both ends with an arrow, as a place
 * after "til" changes form), and under it: why it was cancelled; how many
 * requests wait for an answer; on the trip day when and where it leaves
 * from; that it has left; or, while nothing is asked, its day and time.
 */
export function driverTitle(
  t: Translate,
  locale: Locale,
  trip: MyTrip,
  requests: number,
  at: Date,
): DriverTitle {
  const from = trip.stops[0]?.meetingPoint.name[locale] ?? "";
  const to = trip.stops.at(-1)?.meetingPoint.name[locale] ?? "";
  const title = t("driverTrip.title", { from, to });
  const said = (line: string): DriverTitle => ({ title, line });
  if (trip.status === "cancelled") {
    return said(
      trip.cancellation === null
        ? t("trip.cancelled")
        : t("driverTrip.cancelledTrip", {
            reason: cancelReasonText(t, trip.cancellation.reason),
          }),
    );
  }
  if (requests > 0) return said(t("driverTrip.needsAnswer", { count: requests }));
  const departs = trip.departsAt === null ? null : new Date(trip.departsAt);
  if (departs === null) return said("");
  const time = formatClock(departs);
  if (onTripDay(trip)) {
    const today = compareDays(dayOf(departs), dayOf(at)) === 0;
    return said(t(today ? "booking.todayFrom" : "booking.timeFrom", { time, stop: from }));
  }
  if (departs.getTime() <= at.getTime()) return said(t("trip.departed"));
  return said(capitalised(t("trip.mine.when", { day: formatDay(departs, locale), time }), locale));
}
