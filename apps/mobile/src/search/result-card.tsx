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
import { StyleSheet, Text, View } from "react-native";
import { Card } from "@/components/card";
import { Tag } from "@/components/tag";
import { useLanguage } from "@/i18n/language";
import { dayOf, isoDay } from "@/lib/days";
import { tripHref } from "@/trip-details/trip-link";
import { controlOutline, radii, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/** The searched places, for "1.3 km from Kringlan" under a nearby stop. */
export interface SearchedNames {
  readonly from: string;
  readonly to: string;
}

/**
 * One trip found, for the passenger's part (spec 4, 3.4.1; spec 15's
 * results board): times and stops of the part, the whole trip, the price
 * for one seat and for the seats searched, the booking mode, the driver
 * and the seats left. Other passengers are never shown, not even as taken
 * seats (spec 4, section 7). The card opens the trip for this part.
 */
export function ResultCard({
  result,
  searched,
  seats,
  showDay = false,
}: {
  readonly result: TripSearchResult;
  readonly searched: SearchedNames;
  readonly seats: number;
  /** In a list not grouped by day, such as one sorted by price. */
  readonly showDay?: boolean;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
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
  // The driver's whole trip, only when it goes further than this part.
  const wholeTrip = tripFrom === boardName && tripTo === alightName;
  const tripLine = wholeTrip
    ? null
    : t("results.driverDrives", { driver: result.driver.firstName, from: tripFrom, to: tripTo });
  const mode = result.bookingMode === "instant" ? t("results.instant") : t("results.request");
  const seatsLeft = t("results.seatsLeft", { count: result.freeSeats });
  const day = showDay ? capitalised(formatShortDay(isoDay(dayOf(boardsAt)), locale), locale) : null;
  const driver = `${result.driver.firstName}, ${t("results.newDriver")}`;

  const label = [
    day,
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

  const muted = { color: palette.textMuted };
  return (
    <Card
      accessibilityLabel={label}
      onPress={() => {
        router.push(
          tripHref(
            result.tripId,
            { board: result.board.position, alight: result.alight.position },
            seats,
          ),
        );
      }}
    >
      <View style={styles.content} testID="trip-result">
        {day === null ? null : <Text style={[typography.caption, muted]}>{day}</Text>}
        <View style={styles.top}>
          <View style={styles.stops}>
            <Stop
              time={formatClock(boardsAt)}
              name={boardName}
              details={[boardNearby, duration]}
              boarding
            />
            <Stop time={formatClock(alightsAt)} name={alightName} details={[alightNearby]} />
          </View>
          <View style={styles.price}>
            <Text style={[typography.figure, { color: free ? palette.primary : palette.text }]}>
              {price}
            </Text>
            {free ? null : <Text style={[typography.small, muted]}>{t("results.perSeat")}</Text>}
            {total === null ? null : <Text style={[typography.small, muted]}>{total}</Text>}
          </View>
        </View>
        <View style={styles.tripLine}>
          {tripLine === null ? (
            <View style={styles.grow} />
          ) : (
            <Text style={[typography.small, muted, styles.grow]}>{tripLine}</Text>
          )}
          <Tag kind="positive" label={mode} />
        </View>
        <View style={[styles.divider, { backgroundColor: palette.border }]} />
        <View style={styles.driverRow}>
          <View style={[styles.avatar, { backgroundColor: palette.primarySoft }]}>
            <Text style={[typography.label, { color: palette.primary }]}>
              {result.driver.firstName.charAt(0).toLocaleUpperCase(locale)}
            </Text>
          </View>
          <View style={styles.grow}>
            <Text style={[typography.bodyStrong, { color: palette.text }]}>
              {result.driver.firstName}
            </Text>
            <Tag kind="warning" label={t("results.newDriver")} />
          </View>
          <Text style={[typography.label, { color: palette.text }]}>{seatsLeft}</Text>
        </View>
      </View>
    </Card>
  );
}

/**
 * A stop of the part: its time, its name and lines under it. A line joins
 * the boarding stop's empty dot to the alighting stop's filled one.
 */
function Stop({
  time,
  name,
  details,
  boarding = false,
}: {
  readonly time: string;
  readonly name: string;
  readonly details: readonly (string | null)[];
  readonly boarding?: boolean;
}) {
  const palette = usePalette();
  const colour = { backgroundColor: palette.primary };
  return (
    <View style={[styles.stop, boarding && styles.boarding]}>
      <View style={styles.track}>
        <View style={[styles.lineGap, !boarding && colour]} />
        <View
          style={[
            styles.dot,
            { borderColor: palette.primary },
            !boarding && { backgroundColor: palette.primary },
          ]}
        />
        {boarding ? <View style={[styles.line, colour]} /> : null}
      </View>
      <Text style={[typography.figureSmall, styles.time, { color: palette.text }]}>{time}</Text>
      <View style={styles.grow}>
        <Text style={[typography.bodyStrong, { color: palette.text }]}>{name}</Text>
        {details
          .filter((detail) => detail !== null)
          .map((detail) => (
            <Text key={detail} style={[typography.small, { color: palette.textMuted }]}>
              {detail}
            </Text>
          ))}
      </View>
    </View>
  );
}

const dotSize = spacing.ms;
const avatarSize = spacing.xl;

const styles = StyleSheet.create({
  content: { gap: spacing.ms },
  top: { flexDirection: "row", gap: spacing.sm },
  stops: { flex: 1 },
  stop: { flexDirection: "row", gap: spacing.sm },
  // Room between the stops, which the line runs through.
  boarding: { paddingBottom: spacing.ms },
  track: { width: dotSize, alignItems: "center" },
  // Lines the dot up with the first line of the time; the line runs through it.
  lineGap: { height: spacing.xs, width: controlOutline },
  line: { flex: 1, width: controlOutline },
  dot: {
    width: dotSize,
    height: dotSize,
    borderRadius: radii.pill,
    borderWidth: controlOutline,
  },
  time: { minWidth: spacing.xxl },
  grow: { flex: 1 },
  price: { alignItems: "flex-end" },
  tripLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  divider: { height: controlOutline / 2 },
  driverRow: { flexDirection: "row", alignItems: "center", gap: spacing.ms },
  avatar: {
    width: avatarSize,
    height: avatarSize,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
