import type { Booking, MyTrip } from "@shareride/contracts";
import { carText, formatClock, formatDay, type Locale, type Translate } from "@shareride/i18n";
import { firstNameOf } from "@/people/texts";

// The text "Share trip details" sends (spec 9, 3.3.3): date and time, from
// and to, the meeting point, the driver's first name and the car with its
// number plate. Nothing is stored and no link is made (R9.8).

const parts = (...lines: readonly (string | null)[]) =>
  lines.filter((line): line is string => line !== null).join(" · ");

/**
 * A confirmed booking, as its passenger shares it; null before it is
 * confirmed, since the plate and where to stand come only then (R5.12).
 */
export function bookingShareText(t: Translate, locale: Locale, booking: Booking): string | null {
  const { board, alight, confirmed, car } = booking;
  if (booking.viewer !== "passenger" || booking.status !== "confirmed" || confirmed === null) {
    return null;
  }
  const at = new Date(board.plannedAt);
  const point = board.meetingPoint.name[locale];
  const where = confirmed.whereToStand?.[locale] ?? null;
  const carName = car === null ? null : carText(t, car);
  return parts(
    t("share.when", { date: formatDay(at, locale), time: formatClock(at) }),
    t("search.route", { from: point, to: alight.meetingPoint.name[locale] }),
    where === null ? t("share.point", { point }) : t("share.pointWhere", { point, where }),
    t("share.driver", { driver: firstNameOf(t, booking.driver) }),
    carName === null
      ? null
      : confirmed.registration === null
        ? t("share.car", { car: carName })
        : t("share.carPlate", { car: carName, plate: confirmed.registration }),
    t("share.booked"),
  );
}

/**
 * The driver's own published trip: when, and from the first stop to the
 * last. Never the passengers' names, which are not the driver's to share.
 */
export function tripShareText(t: Translate, locale: Locale, trip: MyTrip): string | null {
  const first = trip.stops[0];
  const last = trip.stops.at(-1);
  if (
    trip.status !== "published" ||
    first === undefined ||
    first.plannedAt === null ||
    last === undefined
  )
    return null;
  const at = new Date(first.plannedAt);
  return parts(
    t("share.when", { date: formatDay(at, locale), time: formatClock(at) }),
    t("search.route", {
      from: first.meetingPoint.name[locale],
      to: last.meetingPoint.name[locale],
    }),
    t("share.offered"),
  );
}
