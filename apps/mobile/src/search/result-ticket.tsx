import type { TripSearchResult } from "@shareride/contracts";
import {
  capitalised,
  formatClock,
  formatDistance,
  formatDuration,
  formatMoney,
  formatShortDay,
} from "@shareride/i18n";
import { router } from "expo-router";
import { UserCheck, Zap } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Avatar } from "@/components/avatar";
import { RideTicket, TicketFoot } from "@/components/ride-ticket";
import { ShareNotice } from "@/components/share-notice";
import { Tag } from "@/components/tag";
import { useLanguage } from "@/i18n/language";
import { dayOf, isoDay } from "@/lib/days";
import type { Shared } from "@/lib/share";
import { RatingLine, ratingText } from "@/people/standing";
import { ShareCorner } from "@/sharing/share-corner";
import { tripHref, tripWebAddress } from "@/trip-details/trip-link";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/** The searched places, for "1.3 km from Kringlan" under a nearby stop. */
export interface SearchedNames {
  readonly from: string;
  readonly to: string;
}

/**
 * One ride found, for the passenger's part, as a ticket (spec 4, 3.4.1;
 * spec 31, 3.3 and 3.6): the day with how a seat is booked beside it, the
 * times and stops of the part, the price for one seat and for the seats
 * searched, the driver's whole ride where it goes further, and under the
 * tear line the driver and the seats left. Other passengers are never
 * shown, not even as taken seats (spec 4, section 7). The ticket opens the
 * ride for this part; the icon in its corner shares the part's link (spec
 * 28, 3.1).
 */
export function ResultTicket({
  result,
  searched,
  seats,
  dayInName = false,
  fill = false,
  onShow,
  marked = false,
}: {
  readonly result: TripSearchResult;
  readonly searched: SearchedNames;
  readonly seats: number;
  /**
   * In a list with no heading for each day, such as one sorted by price:
   * the ticket's name starts with the day. The ticket shows it either way.
   */
  readonly dayInName?: boolean;
  /**
   * In a grid: as tall as the tallest ticket of its row, with the foot at
   * the bottom, so the drivers of a row are level.
   */
  readonly fill?: boolean;
  /**
   * The pointer or the keyboard came to the ticket: the screen shows the
   * ride elsewhere too, as on the map beside search results (spec 18, 3.6).
   */
  readonly onShow?: (() => void) | undefined;
  /** The ride is the one shown there. */
  readonly marked?: boolean;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const [shared, setShared] = useState<Shared | null>(null);
  const boardsAt = new Date(result.board.plannedAt);
  const alightsAt = new Date(result.alight.plannedAt);
  const boardName = result.board.meetingPoint.name[locale];
  const alightName = result.alight.meetingPoint.name[locale];
  const nearby = (distanceM: number | null, place: string) =>
    distanceM === null
      ? null
      : t("results.nearby", { distance: formatDistance(distanceM, locale), place });
  const boardNearby = nearby(result.board.nearbyM, searched.from);
  const alightNearby = nearby(result.alight.nearbyM, searched.to);
  const duration = formatDuration((alightsAt.getTime() - boardsAt.getTime()) / 1000, locale);
  const free = result.pricePerSeat.amount === 0;
  const price = free ? t("results.free") : formatMoney(result.pricePerSeat, locale);
  const total =
    free || seats === 1
      ? null
      : t("results.total", {
          amount: formatMoney(result.total, locale),
          seats: t("search.seatCount", { count: seats }),
        });
  const tripFrom = result.tripFrom[locale];
  const tripTo = result.tripTo[locale];
  // The driver's whole ride, only when it goes further than this part.
  const wholeTrip = tripFrom === boardName && tripTo === alightName;
  const tripLine = wholeTrip
    ? null
    : t("results.driverDrives", { driver: result.driver.firstName, from: tripFrom, to: tripTo });
  const instant = result.bookingMode === "instant";
  const mode = instant ? t("results.instant") : t("results.request");
  const seatsLeft = t("results.seatsLeft", { count: result.freeSeats });
  const day = capitalised(formatShortDay(isoDay(dayOf(boardsAt)), locale), locale);
  // The rating with the number of reviews, or a new driver before the first (spec 4, 3.4.1).
  const rated = result.driver.rating.count > 0;
  const driver = `${result.driver.firstName}, ${
    rated ? ratingText(t, locale, result.driver.rating) : t("results.newDriver")
  }`;

  const label = [
    dayInName ? day : null,
    t("results.boards", { name: boardName, time: formatClock(boardsAt) }),
    boardNearby,
    t("results.alights", { name: alightName, time: formatClock(alightsAt) }),
    alightNearby,
    duration,
    free ? price : `${price} ${t("results.perSeat")}`,
    total,
    tripLine,
    mode,
    driver,
    seatsLeft,
  ]
    .filter((part) => part !== null)
    .join(", ");

  const part = { board: result.board.position, alight: result.alight.position };
  const route = t("search.route", { from: boardName, to: alightName });
  const muted = { color: palette.textMuted };
  const under = (line: string | null) =>
    line === null ? null : <Text style={[typography.small, muted]}>{line}</Text>;

  return (
    // The link to copy by hand, under the ticket, when it could not be shared.
    <View style={[styles.withNotice, fill && styles.fill]}>
      <RideTicket
        testID="trip-result"
        day={day}
        // Moss where a seat is yours at once; blue where the driver answers first (spec 31, rule 6).
        tags={[
          instant
            ? { label: mode, kind: "positive", icon: Zap }
            : { label: mode, kind: "info", icon: UserCheck },
        ]}
        from={{ time: formatClock(boardsAt), place: boardName, under: under(boardNearby) }}
        to={{ time: formatClock(alightsAt), place: alightName, under: under(alightNearby) }}
        between={duration}
        price={{
          amount: price,
          unit: free ? undefined : t("results.perSeat"),
          more: total,
        }}
        note={tripLine}
        fill={fill}
        marked={marked}
        onShow={onShow}
        accessibilityLabel={label}
        onPress={() => {
          router.push(tripHref(result.tripId, part, seats));
        }}
        corner={
          <ShareCorner
            url={tripWebAddress(result.tripId, part)}
            text={t("trip.shareText", { route })}
            route={route}
            onShared={setShared}
          />
        }
        foot={<DriverFoot driver={result.driver} freeSeats={result.freeSeats} />}
      />
      {shared?.outcome === "failed" ? <ShareNotice shared={shared} /> : null}
    </View>
  );
}

/**
 * The foot of a ride's ticket as people looking for a ride see it: the
 * driver's picture and first name, the rating with the number of reviews
 * or "New driver" before the first, and the seats left at the right. The
 * last posting step shows a driver their own (spec 31, 3.11), where the
 * rating is null until it is known and then says neither.
 */
export function DriverFoot({
  driver,
  freeSeats,
}: {
  readonly driver: Pick<TripSearchResult["driver"], "firstName" | "colour" | "photo"> & {
    readonly rating: TripSearchResult["driver"]["rating"] | null;
  };
  readonly freeSeats: number;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  return (
    <TicketFoot
      start={
        <>
          <Avatar small firstName={driver.firstName} colour={driver.colour} photo={driver.photo} />
          <Text style={[typography.label, styles.name, { color: palette.text }]}>
            {driver.firstName}
          </Text>
          {driver.rating === null ? null : driver.rating.count > 0 ? (
            <View style={styles.rating}>
              <RatingLine rating={driver.rating} />
            </View>
          ) : (
            <Tag kind="plain" label={t("results.newDriver")} />
          )}
        </>
      }
      end={
        <Text style={[typography.small, { color: palette.textMuted }]}>
          {t("results.seatsLeft", { count: freeSeats })}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  withNotice: { gap: spacing.sm },
  fill: { flexGrow: 1 },
  // A long name gives way before the rating beside it does.
  name: { flexShrink: 1 },
  rating: { flexShrink: 1 },
});
