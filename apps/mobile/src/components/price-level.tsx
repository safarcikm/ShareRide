import { Minus, Plus } from "lucide-react-native";
import { useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type ViewStyle,
} from "react-native";
import { useLanguage } from "@/i18n/language";
import { controlOutline, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { useScreenScroll } from "./screen";
import { Adjustable, StepButton } from "./stepper";

/**
 * The price level of a trip (spec 3, 3.6; spec 15, `PriceLevel`): a track
 * from free to the highest level the cap allows, in steps, with the
 * suggested level marked; the handle sits at the level. The handle follows
 * a finger or the mouse dragged along the track, a step at a time, and a
 * tap on the track picks the nearest step. Minus and plus change it a step.
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
  const screenScroll = useScreenScroll();
  const [width, setWidth] = useState(0);
  // Where the finger came down on the track, and on the page.
  const touched = useRef<{ readonly x: number; readonly pageX: number } | null>(null);
  const at = (value: number) => (highest === 0 ? 0 : value / highest);
  const lower = () => {
    onChange(Math.max(0, level - step));
  };
  const raise = () => {
    onChange(Math.min(highest, level + step));
  };
  // Every level the track offers.
  const levels = Array.from({ length: Math.floor(highest / step) + 1 }, (_, index) => index * step);
  if (levels.at(-1) !== highest) levels.push(highest);
  const suggestedInside = suggested > 0 && suggested < highest;
  const percent = (value: number) => `${String(at(value) * 100)}%` as const;

  // The level nearest a point `x` along the track, from its left edge.
  const pick = (x: number) => {
    const length = width - sizes.priceHandle;
    if (length <= 0) return;
    const share = Math.min(Math.max((x - sizes.priceHandle / 2) / length, 0), 1);
    const next = nearest(levels, share * highest);
    if (next !== level) onChange(next);
  };
  // A finger, or the mouse, came off the track or was taken away.
  const end = () => {
    touched.current = null;
    if (Platform.OS !== "web") screenScroll?.hold(false);
  };

  return (
    <View style={styles.control}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
        {/* What takes the touch, with the track inside it, an end of the
            levels half the handle in from each side. Its parts take none,
            so a touch's place is always from its left edge. */}
        <View
          testID="price-track"
          collapsable={false}
          hitSlop={trackSlop}
          onLayout={(event) => {
            setWidth(event.nativeEvent.layout.width);
          }}
          onStartShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(event: GestureResponderEvent) => {
            const { locationX, pageX } = event.nativeEvent;
            touched.current = { x: locationX, pageX };
            if (Platform.OS !== "web") screenScroll?.hold(true);
            pick(locationX);
            // Android's scroll does not take a touch the track has.
            return true;
          }}
          onResponderMove={(event: GestureResponderEvent) => {
            const start = touched.current;
            if (start === null) return;
            pick(start.x + event.nativeEvent.pageX - start.pageX);
          }}
          onResponderRelease={end}
          onResponderTerminate={end}
          style={[styles.slider, draggingOnWeb]}
        >
          <View pointerEvents="none" style={styles.trackArea}>
            <View style={[styles.track, { backgroundColor: palette.border }]}>
              <View
                testID="price-fill"
                style={[styles.fill, { width: percent(level), backgroundColor: palette.primary }]}
              />
            </View>
            {levels.map((value) => (
              <View
                key={value}
                testID={`price-step-${String(value)}`}
                style={[styles.dot, { left: percent(value), backgroundColor: palette.surface }]}
              />
            ))}
            <View
              testID="price-handle"
              style={[
                styles.handle,
                {
                  left: percent(level),
                  backgroundColor: palette.primarySoft,
                  borderColor: palette.primary,
                },
              ]}
            />
          </View>
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

/** The level in `levels`, from low to high, nearest `value`; the lower of two as near. */
function nearest(levels: readonly number[], value: number): number {
  return levels.reduce(
    (best, candidate) => (Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best),
    levels[0] ?? 0,
  );
}

const handleOffset = -sizes.priceHandle / 2;
// Above and below the handle, so the track is as tall to touch as a day in the calendar.
const trackSlop = {
  top: (sizes.calendarDay - sizes.priceHandle) / 2,
  bottom: (sizes.calendarDay - sizes.priceHandle) / 2,
};

/**
 * A browser neither scrolls nor selects text from a touch or a press on
 * the track, so the handle follows it; phones hold the screen still instead.
 */
const draggingOnWeb =
  Platform.OS === "web"
    ? ({ touchAction: "none", userSelect: "none", cursor: "pointer" } as unknown as ViewStyle)
    : undefined;

const styles = StyleSheet.create({
  control: { gap: spacing.md },
  slider: { height: sizes.priceHandle },
  // The handle hangs over both ends, so the area leaves room for half of it.
  trackArea: {
    flex: 1,
    justifyContent: "center",
    marginHorizontal: sizes.priceHandle / 2,
  },
  track: { height: sizes.bar, borderRadius: radii.pill, overflow: "hidden" },
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
