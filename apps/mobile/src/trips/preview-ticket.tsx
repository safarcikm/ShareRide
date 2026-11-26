import { publicProfileRoute, type MyTrip } from "@shareride/contracts";
import { peopleColourOf, type Money } from "@shareride/domain";
import {
  capitalised,
  formatClock,
  formatDuration,
  formatMoney,
  formatShortDay,
} from "@shareride/i18n";
import { UserCheck, Zap } from "lucide-react-native";
import { useCallback } from "react";
import { useMe, useSession } from "@/auth/session";
import { RideTicket } from "@/components/ride-ticket";
import { useLanguage } from "@/i18n/language";
import { dayOf, isoDay } from "@/lib/days";
import { useLoaded } from "@/lib/use-loaded";
import { DriverFoot } from "@/search/result-ticket";

/**
 * A ride not published yet, as people will see it (spec 31, 3.11, item 3;
 * R31.2): the ticket of the results for the whole way, with the day, how a
 * seat is booked, the two ends with their times and the stops between them
 * counted, what the whole way costs, and under the tear line the driver as
 * others see them and the seats. It opens nothing: the rows under it
 * change the ride. A ride with no times yet has no ticket.
 *
 * The rating is read from the driver's own public profile; until it is
 * known, or when it cannot be read, the foot says neither a rating nor
 * "New driver".
 */
export function PreviewTicket({
  trip,
  whole,
}: {
  readonly trip: MyTrip;
  /** What a passenger pays for the whole way; null until it is quoted. */
  readonly whole: Money | null;
}) {
  const { locale, t } = useLanguage();
  const me = useMe();
  const session = useSession();
  const profileId = me?.profileId;
  const load = useCallback(
    () =>
      profileId === undefined
        ? Promise.resolve(undefined)
        : session.call(publicProfileRoute, { params: { profileId } }),
    [session, profileId],
  );
  const { value: profile } = useLoaded(load);
  const first = trip.stops[0];
  const last = trip.stops.at(-1);
  if (
    me === null ||
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
  const known = profile?.ok === true ? profile.data : null;
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
            colour: known?.colour ?? peopleColourOf(me.id),
            // A photo PuffinRide hid from others is not on the ticket they see.
            photo: me.photo === null || me.photo.hidden ? null : me.photo.url,
            rating: known?.rating ?? null,
          }}
          freeSeats={trip.seats}
        />
      }
    />
  );
}
