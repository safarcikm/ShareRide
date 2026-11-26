import type { MyTrip, Vehicle } from "@shareride/contracts";
import { routePrice } from "@shareride/domain";
import {
  capitalised,
  formatClock,
  formatDuration,
  formatMoney,
  formatShortDay,
} from "@shareride/i18n";
import { CarFront } from "lucide-react-native";
import type { ReactNode } from "react";
import { StyleSheet, Text } from "react-native";
import { RideTicket, TicketFoot } from "@/components/ride-ticket";
import { carSummary } from "@/driving/texts";
import { useLanguage } from "@/i18n/language";
import { dayOf, isoDay } from "@/lib/days";
import { typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * A ride I drive on its own page (spec 31, 3.12, item 2; R31.2): the day,
 * marked "You drive", the two ends with their times and the stops between
 * them counted, and under the tear line what the whole way costs a
 * passenger and the car. Until it leaves, sharing it is the button in its
 * `corner` (spec 28, 3.1). A ride that was cancelled loses the moss edge
 * of a ride that is mine. It is where you are, so nothing opens when it is
 * pressed.
 */
export function DriverRideTicket({
  trip,
  car,
  corner,
}: {
  readonly trip: MyTrip;
  /** The car it is driven in; null while it is not known, or could not be loaded. */
  readonly car: Vehicle | null;
  readonly corner?: ReactNode;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const first = trip.stops[0];
  const last = trip.stops.at(-1);
  if (
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
  const price = routePrice(trip.segments.map((segment) => segment.price));
  return (
    <RideTicket
      testID="driver-ride-ticket"
      day={capitalised(formatShortDay(isoDay(dayOf(from)), locale), locale)}
      tags={[{ label: t("myRides.driving"), kind: "plain", icon: CarFront }]}
      from={{ time: formatClock(from), place: first.meetingPoint.name[locale] }}
      to={{ time: formatClock(to), place: last.meetingPoint.name[locale] }}
      between={between > 0 ? t("ride.withStops", { duration, count: between }) : duration}
      mine={trip.status !== "cancelled"}
      corner={corner}
      foot={
        <TicketFoot
          start={
            <>
              <Text style={[typography.figure, { color: palette.text }]}>
                {price.amount === 0 ? t("results.free") : formatMoney(price, locale)}
              </Text>
              <Text style={[typography.small, styles.words, { color: palette.textMuted }]}>
                {t("driverTrip.wholeWay")}
              </Text>
            </>
          }
          end={
            car === null ? null : (
              <Text style={[typography.small, { color: palette.textMuted }]}>
                {carSummary(t, locale, car)}
              </Text>
            )
          }
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  // Long words give way before the price beside them does.
  words: { flexShrink: 1 },
});
