import { Minus, Plus } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLanguage } from "@/i18n/language";
import { controlOutline, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Adjustable, StepButton } from "./stepper";

/**
 * The price level of a trip (spec 3, 3.6; spec 15, `PriceLevel`): a track
 * from free to the highest level the cap allows, in steps, with the
 * suggested level marked; the handle sits at the level. Minus and plus
 * change it a step; a tap on the track picks the nearest step. Each step
 * has its own part of the track to tap, so no tap position is read: the web
 * gives none, and on phones it is measured from whatever view was touched.
 * Phones read it as one adjustable element whose value is `valueText`.
 */
export function PriceLevel({
  level,
  highest,
  step,
  suggested,
  onChange,
  valueText,
}: {
  readonly level: number;
  readonly highest: number;
  readonly step: number;
  readonly suggested: number;
  readonly onChange: (level: number) => void;
  /** The level and what it means, such as "100%, the whole route costs 5,800 ISK". */
  readonly valueText: string;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const at = (value: number) => (highest === 0 ? 0 : value / highest);
  const lower = () => {
    onChange(Math.max(0, level - step));
  };
  const raise = () => {
    onChange(Math.min(highest, level + step));
  };
  // Every level the track offers, and the part of it nearest to each.
  const levels = Array.from({ length: Math.floor(highest / step) + 1 }, (_, index) => index * step);
  if (levels.at(-1) !== highest) levels.push(highest);
  const zones = levels.map((value, index) => {
    const start = index === 0 ? 0 : (value + (levels[index - 1] ?? 0)) / 2;
    const end = index === levels.length - 1 ? highest : (value + (levels[index + 1] ?? 0)) / 2;
    return { value, start, end };
  });
  const suggestedInside = suggested > 0 && suggested < highest;
  const percent = (value: number) => `${String(at(value) * 100)}%` as const;

  return (
    <View style={styles.control}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
        <View testID="price-track" style={styles.trackArea}>
          <View pointerEvents="none" style={[styles.track, { backgroundColor: palette.border }]}>
            <View
              testID="price-fill"
              style={[styles.fill, { width: percent(level), backgroundColor: palette.primary }]}
            />
          </View>
          {levels.map((value) => (
            <View
              key={value}
              pointerEvents="none"
              style={[styles.dot, { left: percent(value), backgroundColor: palette.surface }]}
            />
          ))}
          <View
            testID="price-handle"
            pointerEvents="none"
            style={[
              styles.handle,
              {
                left: percent(level),
                backgroundColor: palette.primarySoft,
                borderColor: palette.primary,
              },
            ]}
          />
          {zones.map((zone) => (
            <Pressable
              key={zone.value}
              testID={`price-step-${String(zone.value)}`}
              accessible={false}
              focusable={false}
              onPress={() => {
                onChange(zone.value);
              }}
              style={[
                styles.zone,
                { left: percent(zone.start), width: percent(zone.end - zone.start) },
              ]}
            />
          ))}
        </View>
        <View style={styles.labels}>
          <Text style={[typography.caption, styles.start, { color: palette.textMuted }]}>
            {t("trip.priceLevel.free")}
          </Text>
          {suggestedInside ? (
            <Text
              style={[
                typography.caption,
                styles.middle,
                { left: percent(suggested), color: palette.textMuted },
              ]}
            >
              {t("trip.priceLevel.suggested")}
            </Text>
          ) : null}
          <Text style={[typography.caption, styles.end, { color: palette.textMuted }]}>
            {highest === suggested ? t("trip.priceLevel.suggested") : t("trip.priceLevel.highest")}
          </Text>
        </View>
      </View>
      <Adjustable
        label={t("trip.priceLevel")}
        value={level}
        valueText={valueText}
        canDecrease={level > 0}
        canIncrease={level < highest}
        onDecrease={lower}
        onIncrease={raise}
      >
        <View style={styles.buttons}>
          <StepButton
            icon={Minus}
            label={t("trip.priceLevel.lower")}
            onPress={lower}
            disabled={level <= 0}
          />
          <Text
            testID="price-level-value"
            accessibilityLiveRegion="polite"
            style={[typography.figure, styles.value, { color: palette.text }]}
          >
            {level === 0 ? t("trip.priceLevel.free") : `${String(level)}%`}
          </Text>
          <StepButton
            icon={Plus}
            label={t("trip.priceLevel.raise")}
            onPress={raise}
            disabled={level >= highest}
          />
        </View>
      </Adjustable>
    </View>
  );
}

const handleOffset = -sizes.priceHandle / 2;

const styles = StyleSheet.create({
  control: { gap: spacing.md },
  // The handle hangs over both ends, so the area leaves room for half of it.
  trackArea: {
    height: sizes.priceHandle,
    justifyContent: "center",
    marginHorizontal: sizes.priceHandle / 2,
  },
  track: { height: sizes.bar, borderRadius: radii.pill, overflow: "hidden" },
  // Over the track, so a tap anywhere along it lands on a step.
  zone: { position: "absolute", top: 0, bottom: 0 },
  fill: { height: sizes.bar },
  dot: {
    position: "absolute",
    width: sizes.priceDot,
    height: sizes.priceDot,
    marginLeft: -sizes.priceDot / 2,
    borderRadius: radii.pill,
  },
  handle: {
    position: "absolute",
    width: sizes.priceHandle,
    height: sizes.priceHandle,
    marginLeft: handleOffset,
    borderRadius: radii.pill,
    borderWidth: controlOutline + 1,
  },
  labels: {
    height: typography.caption.lineHeight,
    marginTop: spacing.xs,
    marginHorizontal: sizes.priceHandle / 2,
  },
  start: { position: "absolute", left: 0 },
  end: { position: "absolute", right: 0 },
  middle: {
    position: "absolute",
    width: sizes.priceLabel,
    marginLeft: -sizes.priceLabel / 2,
    textAlign: "center",
  },
  buttons: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  value: { minWidth: sizes.priceLabel, textAlign: "center" },
});
