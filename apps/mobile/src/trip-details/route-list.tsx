import type { TripDetails } from "@shareride/contracts";
import { formatClock } from "@shareride/i18n";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/button";
import { TextLink } from "@/components/text-link";
import { useLanguage } from "@/i18n/language";
import { controlOutline, minTouchTarget, radii, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import type { Part } from "./trip-link";

type Stop = TripDetails["stops"][number];

/** Getting in at a stop moves the getting-out stop on when it would come first. */
export function getInAt(part: Part, position: number, last: number): Part {
  return {
    board: position,
    alight: part.alight > position ? part.alight : Math.min(position + 1, last),
  };
}

/** Getting out at a stop moves the getting-in stop back when it would come after. */
export function getOutAt(part: Part, position: number): Part {
  return {
    board: part.board < position ? part.board : Math.max(position - 1, 0),
    alight: position,
  };
}

/** Enough dots for the tallest row; the track cuts off the rest. */
const dots = Array.from({ length: 24 }, (_, index) => index);

/**
 * The route (spec 4, 3.6.2; spec 15, `RouteLine`): every stop with its
 * time, the passenger's part solid and highlighted, the rest dotted and
 * greyed. A stop opens to get in or out there, or to see the meeting point.
 */
export function RouteList({
  stops,
  part,
  onChange,
}: {
  readonly stops: readonly Stop[];
  readonly part: Part;
  readonly onChange: (part: Part) => void;
}) {
  const { locale, t } = useLanguage();
  const palette = usePalette();
  const [open, setOpen] = useState<number | null>(null);
  const last = stops.length - 1;
  const inPart = (position: number) => position >= part.board && position <= part.alight;
  const choose = (next: Part) => {
    setOpen(null);
    onChange(next);
  };

  return (
    <View>
      {stops.map((stop) => {
        const { position } = stop;
        const time = formatClock(new Date(stop.plannedAt));
        const name = stop.meetingPoint.name[locale];
        const ridden = inPart(position);
        const boarding = position === part.board;
        const alighting = position === part.alight;
        const label = boarding
          ? t("trip.stopGettingIn", { time, name })
          : alighting
            ? t("trip.stopGettingOut", { time, name })
            : ridden
              ? t("trip.stopOnPart", { time, name })
              : t("trip.stopOffPart", { time, name });
        const isOpen = open === position;
        const above =
          position > 0 ? (position > part.board && ridden ? "solid" : "dotted") : "none";
        const below =
          position < last
            ? position >= part.board && position < part.alight
              ? "solid"
              : "dotted"
            : "none";
        return (
          <View key={stop.position} style={styles.row} testID="route-stop">
            <Text
              style={[
                ridden ? typography.figureSmall : typography.small,
                styles.time,
                { color: ridden ? palette.text : palette.textMuted },
              ]}
            >
              {time}
            </Text>
            <View style={styles.track}>
              <Segment kind={above} />
              <View
                style={[
                  styles.dot,
                  {
                    borderColor: ridden ? palette.primary : palette.control,
                    backgroundColor: palette.background,
                  },
                ]}
              />
              <Segment kind={below} grow />
            </View>
            <View style={styles.content}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={label}
                aria-expanded={isOpen}
                onPress={() => {
                  setOpen(isOpen ? null : position);
                }}
                style={styles.stop}
              >
                <Text
                  style={[
                    boarding || alighting ? typography.bodyStrong : typography.body,
                    styles.name,
                    { color: ridden ? palette.text : palette.textMuted },
                  ]}
                >
                  {name}
                </Text>
                {boarding || alighting ? (
                  <Text style={[typography.label, { color: palette.primary }]}>
                    {boarding ? t("trip.getIn") : t("trip.getOut")}
                  </Text>
                ) : null}
              </Pressable>
              {isOpen ? (
                <View style={styles.choices}>
                  {position < last && !boarding ? (
                    <Button
                      variant="secondary"
                      label={t("trip.getInHere")}
                      onPress={() => {
                        choose(getInAt(part, position, last));
                      }}
                    />
                  ) : null}
                  {position > 0 && !alighting ? (
                    <Button
                      variant="secondary"
                      label={t("trip.getOutHere")}
                      onPress={() => {
                        choose(getOutAt(part, position));
                      }}
                    />
                  ) : null}
                  <TextLink
                    label={t("trip.aboutPoint")}
                    href={`/meeting-points/${stop.meetingPoint.id}`}
                  />
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** The line between two stops: solid on the passenger's part, dotted elsewhere. */
function Segment({
  kind,
  grow = false,
}: {
  readonly kind: "solid" | "dotted" | "none";
  readonly grow?: boolean;
}) {
  const palette = usePalette();
  const style = grow ? styles.below : styles.above;
  if (kind === "none") return <View style={style} />;
  if (kind === "solid") {
    return <View style={[style, styles.solid, { backgroundColor: palette.primary }]} />;
  }
  // The dots sit on their own layer, so they never make the row taller (the web counts them).
  return (
    <View style={[style, styles.dotted]}>
      <View style={styles.dotsLayer}>
        {dots.map((index) => (
          <View key={index} style={[styles.dotOfLine, { backgroundColor: palette.control }]} />
        ))}
      </View>
    </View>
  );
}

const dotSize = spacing.ms;

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm },
  // Centred on the first row of the stop, as the dot is.
  time: {
    minWidth: spacing.xxl,
    paddingTop: (minTouchTarget - typography.figureSmall.lineHeight) / 2,
  },
  track: { width: dotSize, alignItems: "center" },
  // Lines the dot up with the middle of the stop's first row.
  above: { height: (minTouchTarget - dotSize) / 2, width: controlOutline },
  below: { flex: 1, width: controlOutline, minHeight: spacing.sm },
  solid: { width: controlOutline },
  dotted: { overflow: "hidden" },
  dotsLayer: { ...StyleSheet.absoluteFill, alignItems: "center", gap: spacing.xs },
  dotOfLine: { width: controlOutline, height: controlOutline, borderRadius: radii.pill },
  dot: { width: dotSize, height: dotSize, borderRadius: radii.pill, borderWidth: controlOutline },
  content: { flex: 1, paddingBottom: spacing.ms, gap: spacing.sm },
  stop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTouchTarget,
  },
  name: { flex: 1 },
  choices: { gap: spacing.sm, alignItems: "flex-start" },
});
