import type { MyTrip, PublicProfile } from "@shareride/contracts";
import { peopleColourOf, type Money } from "@shareride/domain";
import {
  capitalised,
  formatClock,
  formatDuration,
  formatMoney,
  formatShortDay,
} from "@shareride/i18n";
import { UserCheck, Zap } from "lucide-react-native";
import { useMe } from "@/auth/session";
import { RideTicket } from "@/components/ride-ticket";
import { useLanguage } from "@/i18n/language";
import { dayOf, isoDay } from "@/lib/days";
import { DriverFoot } from "@/search/result-ticket";

/** Whether a ride has the times its ticket needs: a draft gets them on step 2. */
export function hasPreview(trip: MyTrip): boolean {
  return trip.stops.length > 0 && trip.stops.every((stop) => stop.plannedAt !== null);
}

/**
 * A ride not published yet, as people will see it (spec 31, 3.11, item 3;
 * R31.2): the ticket of the results for the whole way, with the day, how a
 * seat is booked, the two ends with their times and the stops between them
 * counted, what the whole way costs, and under the tear line the driver as
 * others see them and the seats. It opens nothing: the rows under it
 * change the ride. A ride with no times yet has no ticket.
 *
 * The rating and the colour are those of the driver's own public
 * `profile`; until it is known, or when it could not be read, the foot
 * says neither a rating nor "New driver".
 */
export function PreviewTicket({
  trip,
  whole,
  profile,
}: {
  readonly trip: MyTrip;
  /** What a passenger pays for the whole way; null until it is quoted. */
  readonly whole: Money | null;
  /** The driver as others see them; null while that is not known. */
  readonly profile: PublicProfile | null;
}) {
  const { locale, t } = useLanguage();
  const me = useMe();
  const first = trip.stops[0];
  const last = trip.stops.at(-1);
  if (
    me === null ||
    !hasPreview(trip) ||
    first === undefined ||
    last === undefined ||
    first.plannedAt === null ||
    last.plannedAt === null
  ) {
    return null;
  }
  const from = new Date(first.plannedAt);
  const to = new Date(last.plannedAt);
  const duration = formatDuration((to.getTime() - from.getTime()) / 1000, locale);
  const between = trip.stops.length - 2;
  const instant = trip.bookingMode === "instant";
  return (
    <RideTicket
      testID="preview-ticket"
      day={capitalised(formatShortDay(isoDay(dayOf(from)), locale), locale)}
      // As in the results: moss where a seat is booked at once, blue where the driver answers.
      tags={[
        instant
          ? { label: t("results.instant"), kind: "positive", icon: Zap }
          : { label: t("results.request"), kind: "info", icon: UserCheck },
      ]}
      from={{ time: formatClock(from), place: first.meetingPoint.name[locale] }}
      to={{ time: formatClock(to), place: last.meetingPoint.name[locale] }}
      between={between > 0 ? t("ride.withStops", { duration, count: between }) : duration}
      price={
        whole === null
          ? null
          : whole.amount === 0
            ? { amount: t("results.free") }
            : { amount: formatMoney(whole, locale), unit: t("driverTrip.wholeWay") }
      }
      foot={
        <DriverFoot
          driver={{
            firstName: me.firstName ?? "",
            colour: profile?.colour ?? peopleColourOf(me.id),
            // A photo PuffinRide hid from others is not on the ticket they see.
            photo: me.photo === null || me.photo.hidden ? null : me.photo.url,
            rating: profile?.rating ?? null,
          }}
          freeSeats={trip.seats}
        />
      }
    />
  );
}
