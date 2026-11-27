import type { MyTrip, TripBookings } from "@shareride/contracts";
import { busiestStretch } from "@shareride/domain";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Heading } from "@/components/text";
import { useLanguage } from "@/i18n/language";
import { controlOutline, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { occupancies, Stretches } from "./parts";

/**
 * The seats of a ride I drive, in one line (spec 31, 3.12, item 5): a
 * square for each seat, the taken ones filled, and beside them "1 of 3
 * taken" with where that is, "at the busiest, Mjódd to Selfoss". Requests
 * waiting for an answer hold seats too (rule S1). "Each stretch" unfolds
 * a bar for every stretch (spec 5, 3.7); a ride of one stretch has only
 * the line. The page keeps whether it is `open`, as the card moves
 * between a phone's column and a wide screen's side column.
 */
export function SeatsCard({
  trip,
  segments,
  capacity,
  open,
  onToggle,
}: {
  readonly trip: MyTrip;
  readonly segments: TripBookings["segments"];
  readonly capacity: number;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const fullest = busiestStretch(occupancies(trip, segments));
  const taken = Math.min(fullest?.taken ?? 0, capacity);
  const several = trip.stops.length > 2;
  return (
    <Card>
      <View testID="seats-card" style={styles.card}>
        <View style={styles.head}>
          <View style={styles.grow}>
            <Heading>{t("driverTrip.seats")}</Heading>
          </View>
          {several ? (
            <Button
              variant="text"
              label={t("driverTrip.eachStretch")}
              expanded={open}
              onPress={onToggle}
            />
          ) : null}
        </View>
        <View style={styles.line}>
          {/* The words beside them say the same. */}
          <View
            aria-hidden
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.squares}
          >
            {Array.from({ length: capacity }, (_seat, index) =>
              index < taken ? (
                <View
                  key={index}
                  testID="seat-taken"
                  style={[styles.seat, { backgroundColor: palette.primary }]}
                />
              ) : (
                <View
                  key={index}
                  testID="seat-free"
                  style={[styles.seat, styles.free, { borderColor: palette.control }]}
                />
              ),
            )}
          </View>
          <View style={styles.words}>
            <Text style={[typography.bodyStrong, { color: palette.text }]}>
              {t("driverTrip.seatsTaken", { taken, seats: capacity })}
            </Text>
            {/* Where the ride is fullest; nothing to name while no seat is taken. */}
            {fullest === null || taken === 0 || !several ? null : (
              <Text style={[typography.small, { color: palette.textMuted }]}>
                {t("driverTrip.atBusiest", {
                  from: trip.stops[fullest.from]?.meetingPoint.name[locale] ?? "",
                  to: trip.stops[fullest.to]?.meetingPoint.name[locale] ?? "",
                })}
              </Text>
            )}
          </View>
        </View>
        {open && several ? <Stretches trip={trip} segments={segments} capacity={capacity} /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.ms },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  grow: { flex: 1, minWidth: 0 },
  // The words go under the squares where a car of many seats leaves them no room.
  line: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: spacing.ms,
    rowGap: spacing.sm,
  },
  squares: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  seat: { width: sizes.seat, height: sizes.seat, borderRadius: radii.tag },
  free: { borderWidth: controlOutline, borderStyle: "dashed" },
  words: { flexGrow: 1, flexShrink: 1, flexBasis: sizes.wordsBeside, minWidth: 0 },
});
