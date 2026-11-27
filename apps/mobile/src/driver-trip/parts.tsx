import type { MyTrip, TripBookings } from "@shareride/contracts";
import type { Locale } from "@shareride/i18n";
import { StyleSheet, Text, View } from "react-native";
import { useLanguage } from "@/i18n/language";
import { controlOutline, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

// The seats held on each stretch of a ride I drive (spec 5, 3.7; rule S1).

type Segments = TripBookings["segments"];

/** A stretch's ends by stop position, in the language on screen. */
function stretchNames(trip: MyTrip, position: number, locale: Locale) {
  return {
    from: trip.stops[position]?.meetingPoint.name[locale] ?? "",
    to: trip.stops[position + 1]?.meetingPoint.name[locale] ?? "",
  };
}

const heldOn = (segments: Segments, position: number) =>
  segments.find((segment) => segment.position === position)?.occupancy ?? 0;

/** The seats held on each stretch, in ride order: one number for each stretch. */
export const occupancies = (trip: MyTrip, segments: Segments): number[] =>
  trip.stops.slice(1).map((_stop, position) => heldOn(segments, position));

/**
 * Seats on a stretch as a bar: seats taken, then free ones. The words
 * beside it say the same, for screen readers.
 */
function SeatBar({ taken, capacity }: { readonly taken: number; readonly capacity: number }) {
  const palette = usePalette();
  const share = (count: number) =>
    `${String((Math.min(count, capacity) / capacity) * 100)}%` as const;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.bar, { backgroundColor: palette.background, borderColor: palette.border }]}
    >
      <View style={{ width: share(taken), backgroundColor: palette.primary }} />
    </View>
  );
}

/** Each stretch of the trip with the seats held on it (rule S1). */
export function Stretches({
  trip,
  segments,
  capacity,
}: {
  readonly trip: MyTrip;
  readonly segments: Segments;
  readonly capacity: number;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  return (
    <View style={styles.list}>
      {trip.stops.slice(1).map((_stop, position) => {
        const names = stretchNames(trip, position, locale);
        const taken = t("driverTrip.taken", { taken: heldOn(segments, position), capacity });
        return (
          <View
            key={position}
            accessible
            accessibilityLabel={`${t("trip.stretchSpoken", names)}, ${taken}`}
            style={styles.stretch}
          >
            <Text style={[typography.label, { color: palette.text }]}>
              {t("trip.stretch", names)}
            </Text>
            <SeatBar taken={heldOn(segments, position)} capacity={capacity} />
            <Text style={[typography.small, { color: palette.textMuted }]}>{taken}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  stretch: { gap: spacing.xs },
  bar: {
    flexDirection: "row",
    height: sizes.bar,
    borderRadius: radii.pill,
    borderWidth: controlOutline,
    overflow: "hidden",
  },
});
