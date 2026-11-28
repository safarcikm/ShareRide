import { Minus, Plus } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type NativeTouchEvent,
  type ViewStyle,
} from "react-native";
import { useLanguage } from "@/i18n/language";
import { controlOutline, minTouchTarget, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { useScreenScroll, type ScreenScroll } from "./screen";
import { Adjustable, StepButton } from "./stepper";

/** How far a finger moves on the track before it is a slide or a scroll. */
export const slideSlop = spacing.xs;

/** Where a touch on the track stands. */
type TrackTouch =
  /** Down, and not moved enough to tell: let go here, it is a tap. */
  | {
      readonly kind: "deciding";
      readonly id: number;
      readonly x: number;
      readonly pageX: number;
      readonly pageY: number;
    }
  /** Moved mostly sideways: the handle follows it, from where it came down. */
  | { readonly kind: "sliding"; readonly id: number; readonly x: number; readonly pageX: number }
  /** Moved mostly up or down: the page scrolls, and the level stays. */
  | { readonly kind: "scrolling" };

/**
 * The price level of a trip (spec 3, 3.6; spec 15, `PriceLevel`): a track
 * from free to the highest level the cap allows, in steps, with the
 * suggested level marked; the handle sits at the level. The handle follows
 * a finger or the mouse dragged sideways along the track, a step at a
 * time, and a tap on the track picks the nearest step; a finger that moves
 * up or down there scrolls the page instead. Minus and plus change it a
 * step. Phones read it as one adjustable element whose value is `valueText`.
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
  const touch = useRef<TrackTouch | null>(null);
  // The level last asked for, which the level shown can lag behind while
  // moves come quicker than the screen draws.
  const sent = useRef(level);
  // A track taken away in the middle of a slide, as when its prices cannot
  // be had, gets no word that the finger left: the screen scrolls again.
  useEffect(
    () => () => {
      if (touch.current?.kind === "sliding") holdScroll(screenScroll, false);
    },
    [screenScroll],
  );
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
    if (next === sent.current) return;
    sent.current = next;
    onChange(next);
  };
  // The finger, or the mouse, came off the track, or the scroll took it.
  const end = () => {
    if (touch.current?.kind === "sliding") holdScroll(screenScroll, false);
    touch.current = null;
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
          onLayout={(event) => {
            setWidth(event.nativeEvent.layout.width);
          }}
          onStartShouldSetResponder={() => true}
          // Until it slides, a scroll of the page may take the touch.
          onResponderTerminationRequest={() => touch.current?.kind !== "sliding"}
          onResponderGrant={(event: GestureResponderEvent) => {
            const { identifier, locationX, pageX, pageY } = event.nativeEvent;
            touch.current = { kind: "deciding", id: identifier, x: locationX, pageX, pageY };
            sent.current = level;
          }}
          onResponderMove={(event: GestureResponderEvent) => {
            const now = touch.current;
            if (now === null || now.kind === "scrolling") return;
            // Only the finger that came down on the track moves the handle.
            const finger = ownFinger(event, now.id);
            if (finger === undefined) return;
            const moved = finger.pageX - now.pageX;
            if (now.kind === "deciding") {
              const upOrDown = finger.pageY - now.pageY;
              if (Math.max(Math.abs(moved), Math.abs(upOrDown)) < slideSlop) return;
              if (Math.abs(moved) <= Math.abs(upOrDown)) {
                touch.current = { kind: "scrolling" };
                return;
              }
              touch.current = { kind: "sliding", id: now.id, x: now.x, pageX: now.pageX };
              holdScroll(screenScroll, true);
            }
            pick(now.x + moved);
          }}
          onResponderRelease={(event: GestureResponderEvent) => {
            // A tap, or a slide too short for a phone's browser to tell of
            // moves on the way: the step where the finger came off.
            const now = touch.current;
            const finger = now?.kind === "deciding" ? ownFinger(event, now.id) : undefined;
            if (now?.kind === "deciding" && finger !== undefined) {
              pick(now.x + finger.pageX - now.pageX);
            }
            end();
          }}
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

/**
 * Holds a phone's screen still while a finger slides the handle, or lets
 * it scroll again: an iPhone would scroll the page with the finger's up
 * and down. The browser keeps its scroll off the track itself.
 */
function holdScroll(screenScroll: ScreenScroll | null, held: boolean) {
  if (Platform.OS !== "web") screenScroll?.hold(held);
}

/**
 * The finger `id` as it is now, from a move of any finger on the screen,
 * or as it came off.
 */
function ownFinger(event: GestureResponderEvent, id: number): NativeTouchEvent | undefined {
  const { nativeEvent } = event;
  const fingers = [
    ...((nativeEvent.touches as readonly NativeTouchEvent[] | undefined) ?? []),
    ...((nativeEvent.changedTouches as readonly NativeTouchEvent[] | undefined) ?? []),
  ];
  return (
    fingers.find((finger) => finger.identifier === id) ??
    (nativeEvent.identifier === id ? nativeEvent : undefined)
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
/**
 * A browser scrolls the page for a finger that moves up or down on the
 * track and leaves one that moves sideways to the handle, and selects no
 * text while the mouse drags it. Phones hold the screen still instead.
 */
const draggingOnWeb =
  Platform.OS === "web"
    ? ({ touchAction: "pan-y", userSelect: "none", cursor: "pointer" } as unknown as ViewStyle)
    : undefined;

const styles = StyleSheet.create({
  control: { gap: spacing.md },
  // As tall as a touch target, the handle in its middle.
  slider: { height: minTouchTarget, justifyContent: "center" },
  // The handle hangs over both ends, so the area leaves room for half of it.
  trackArea: {
    height: sizes.priceHandle,
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
  // The touch target's room under the handle stands between them.
  labels: {
    height: typography.caption.lineHeight,
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
