import { ChevronDown, ChevronUp, CircleAlert } from "lucide-react-native";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ComponentRef } from "react";
import {
  AccessibilityInfo,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useLanguage } from "@/i18n/language";
import { clockText, minuteStep, type Clock } from "@/lib/clock-time";
import { controlOutline, iconSizes, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Button } from "./button";
import { Icon } from "./icon";
import { useScreenScroll } from "./screen";
import { Adjustable } from "./stepper";

type ViewRef = ComponentRef<typeof View>;

const hours = Array.from({ length: 24 }, (_, hour) => hour);
const minutes = Array.from({ length: 60 / minuteStep }, (_, step) => step * minuteStep);
/** Rows above and below the chosen one. */
const around = Math.floor(sizes.wheelRows / 2);
const twoDigits = (value: number) => String(value).padStart(2, "0");

interface TimeFieldProps {
  /** Shown above the field, such as "Leaving BSÍ bus terminal at". */
  readonly label: string;
  /** The chosen time, or null when none is chosen yet. */
  readonly value: Clock | null;
  /** The time the wheel starts at when none is chosen yet. */
  readonly suggested: Clock;
  /** Whether the wheel is open under the field; a screen keeps one open at a time. */
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly onChange: (clock: Clock) => void;
  /** Shown under the field. */
  readonly help?: string | undefined;
  /** Shown under the field in place of the help, and read out by screen readers. */
  readonly error?: string | undefined;
}

/**
 * A time of day on a 24-hour clock, in 5-minute steps (spec 15, `TimeField`):
 * a field with the time that opens a wheel of hours and minutes under it.
 * The wheel stops on a row and chooses it; a tap on a row chooses it too.
 * Done, a second press on the field, Escape and Android's back close it.
 */
export function TimeField({
  label,
  value,
  suggested,
  open,
  onOpen,
  onClose,
  onChange,
  help,
  error,
}: TimeFieldProps) {
  const { t } = useLanguage();
  const palette = usePalette();
  const group = useRef<ViewRef>(null);
  const field = useRef<ViewRef>(null);
  const hint = error ?? help;
  const hasError = error !== undefined;
  const shown = value === null ? t("time.choose") : clockText(value);
  const outline = hasError ? palette.error : open ? palette.primary : palette.control;
  const hintId = useId();
  const describedBy: object =
    Platform.OS === "web" && hint !== undefined ? { "aria-describedby": hintId } : {};

  // Opening: up the screen so the wheel shows under the field.
  const screenScroll = useScreenScroll();
  useEffect(() => {
    if (!open) return undefined;
    if (Platform.OS === "web") {
      const node = group.current as unknown as { scrollIntoView?: (options: object) => void };
      node.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
      return undefined;
    }
    return screenScroll?.reveal(group);
  }, [open, screenScroll]);

  /** Closing from inside the wheel puts focus back on the field. */
  const close = () => {
    onClose();
    const target = field.current;
    if (target === null) return;
    if (Platform.OS === "web") (target as unknown as { focus: () => void }).focus();
    else AccessibilityInfo.sendAccessibilityEvent(target, "focus");
  };

  // On the web, Escape closes the wheel wherever focus is in it.
  const escape: object =
    Platform.OS === "web" && open
      ? {
          onKeyDown: (event: { key: string }) => {
            if (event.key === "Escape") close();
          },
        }
      : {};

  // Android's back closes the wheel rather than leaving the screen.
  useEffect(() => {
    if (!open) return undefined;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => {
      subscription.remove();
    };
  });

  return (
    <View ref={group} style={styles.field} {...escape}>
      {/* The field's name says the label, so screen readers skip this. */}
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no"
        aria-hidden
        style={[typography.label, { color: palette.text }]}
      >
        {label}
      </Text>
      <Pressable
        ref={field}
        accessibilityRole="button"
        accessibilityLabel={t("time.field", { field: label, time: shown })}
        accessibilityHint={hint}
        aria-expanded={open}
        aria-invalid={hasError}
        {...describedBy}
        onPress={() => {
          if (open) {
            onClose();
            return;
          }
          if (value === null) onChange(suggested);
          onOpen();
        }}
        style={[styles.input, { borderColor: outline, backgroundColor: palette.surface }]}
      >
        <Text
          style={[
            value === null ? typography.body : typography.bodyStrong,
            styles.value,
            { color: value === null ? palette.textMuted : palette.text },
          ]}
        >
          {shown}
        </Text>
        <Icon icon={open ? ChevronUp : ChevronDown} color={palette.text} />
      </Pressable>
      {open ? <Wheel value={value ?? suggested} onChange={onChange} onDone={close} /> : null}
      {hint === undefined ? null : (
        <View style={styles.hint}>
          {hasError ? (
            <Icon icon={CircleAlert} color={palette.error} size={iconSizes.inline} />
          ) : null}
          <Text
            nativeID={hintId}
            accessibilityLiveRegion={hasError ? "polite" : "none"}
            style={[
              typography.small,
              styles.hintText,
              { color: hasError ? palette.error : palette.textMuted },
            ]}
          >
            {hint}
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * A row of the wheel and the width of one wheel, for the text size chosen
 * on the phone: at least 44 high and 64 wide, larger as the text grows.
 */
export function wheelSize(fontScale: number) {
  const figure = typography.figure;
  return {
    row: Math.max(sizes.wheelRow, Math.ceil(figure.lineHeight * fontScale) + spacing.sm * 2),
    width: Math.max(sizes.wheelWidth, Math.ceil(figure.fontSize * 1.3 * fontScale) + spacing.xl),
  };
}

/** The hours and the minutes side by side, with a band across the chosen row. */
function Wheel({
  value,
  onChange,
  onDone,
}: {
  readonly value: Clock;
  readonly onChange: (clock: Clock) => void;
  readonly onDone: () => void;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const { row, width } = wheelSize(useWindowDimensions().fontScale);
  const minuteIndex = Math.min(minutes.length - 1, Math.ceil(value.minute / minuteStep));
  return (
    <View style={[styles.wheel, { borderColor: palette.border, backgroundColor: palette.surface }]}>
      <View style={styles.columns}>
        <View
          style={[
            styles.band,
            { top: around * row, height: row, backgroundColor: palette.primarySoft },
          ]}
        />
        <Column
          name={t("time.hour")}
          testID="hour-wheel"
          values={hours}
          index={value.hour}
          row={row}
          width={width}
          onChange={(index) => {
            onChange({ hour: hours[index] ?? value.hour, minute: value.minute });
          }}
        />
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no"
          aria-hidden
          style={[typography.figure, { color: palette.text }]}
        >
          :
        </Text>
        <Column
          name={t("time.minutes")}
          testID="minute-wheel"
          values={minutes}
          index={minuteIndex}
          row={row}
          width={width}
          onChange={(index) => {
            onChange({ hour: value.hour, minute: minutes[index] ?? value.minute });
          }}
        />
      </View>
      <Button label={t("time.done")} variant="secondary" onPress={onDone} />
    </View>
  );
}

/**
 * One wheel: rows that scroll and stop on a row, the chosen one in the band.
 * Screen readers on phones read it as one adjustable element, swiped up or
 * down; on the web the scrolling part is a spin button, changed with the
 * arrow keys, Home and End.
 */
function Column({
  name,
  testID,
  values,
  index,
  row,
  width,
  onChange,
}: {
  readonly name: string;
  readonly testID: string;
  readonly values: readonly number[];
  readonly index: number;
  readonly row: number;
  readonly width: number;
  readonly onChange: (index: number) => void;
}) {
  const palette = usePalette();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  /** The row the wheel stands on, or is moving to. */
  const standing = useRef(index);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placed = useRef(false);
  // The web build reports one more scroll about 100 ms after the last, even
  // once the wheel has closed, and reads 0 from the removed element then.
  const shown = useRef(true);
  // Where the wheel starts. A contentOffset that changed with each choice
  // would make phones jump there again, cutting into the wheel's own moves.
  const [start] = useState(() => ({ x: 0, y: index * row }));
  const last = values.length - 1;

  const moveTo = (next: number, animated: boolean) => {
    standing.current = next;
    scroll.current?.scrollTo({ x: 0, y: next * row, animated });
  };
  /** Chooses a row: from a tap, a key or a screen reader. */
  const choose = (next: number) => {
    const kept = Math.max(0, Math.min(last, next));
    moveTo(kept, true);
    if (kept !== index) onChange(kept);
  };
  /** Where the wheel stopped after scrolling. */
  const stoppedAt = (y: number) => {
    const stopped = Math.max(0, Math.min(last, Math.round(y / row)));
    if (stopped === standing.current) return;
    standing.current = stopped;
    onChange(stopped);
  };
  // A stop that waits calls the latest stoppedAt, so it builds on the time as
  // it is then, not as it was when the wait began.
  const latestStop = useRef(stoppedAt);
  useLayoutEffect(() => {
    latestStop.current = stoppedAt;
  });
  const waitThenStop = (y: number) => {
    if (!shown.current) return;
    if (settle.current !== null) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      if (shown.current) latestStop.current(y);
    }, 120);
  };

  // A value changed from outside the wheel, such as by a key, moves it there.
  useEffect(() => {
    if (standing.current === index) return;
    if (placed.current) moveTo(index, true);
    else standing.current = index;
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps -- moveTo changes each render
  useEffect(() => {
    shown.current = true;
    return () => {
      shown.current = false;
      if (settle.current !== null) clearTimeout(settle.current);
    };
  }, []);

  const value = values[index] ?? 0;
  const spinButton: object =
    Platform.OS === "web"
      ? {
          role: "spinbutton",
          "aria-label": name,
          "aria-valuenow": value,
          "aria-valuetext": twoDigits(value),
          "aria-valuemin": values[0],
          "aria-valuemax": values[last],
          tabIndex: 0,
          onKeyDown: (event: { key: string; preventDefault: () => void }) => {
            const steps: Record<string, number> = {
              ArrowUp: standing.current + 1,
              ArrowDown: standing.current - 1,
              Home: 0,
              End: last,
            };
            const next = steps[event.key];
            if (next === undefined) return;
            event.preventDefault(); // The arrows would scroll the page instead.
            choose(next);
          },
        }
      : {};
  /** On the web, a click on a row leaves focus on the spin button, not the row. */
  const keepFocus = () => {
    if (Platform.OS !== "web") return;
    const node = scroll.current?.getScrollableNode() as { focus?: (options: object) => void };
    node.focus?.({ preventScroll: true });
  };

  return (
    <Adjustable
      label={name}
      value={value}
      valueText={twoDigits(value)}
      canDecrease={index > 0}
      canIncrease={index < last}
      onDecrease={() => {
        choose(standing.current - 1);
      }}
      onIncrease={() => {
        choose(standing.current + 1);
      }}
    >
      <ScrollView
        ref={scroll}
        testID={testID}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        // Android rounds an interval down to whole pixels, which adds up down
        // the wheel; each offset of its own is off by a pixel at most.
        snapToOffsets={values.map((_, position) => position * row)}
        decelerationRate="fast"
        contentOffset={start}
        onContentSizeChange={() => {
          // The web has no contentOffset: stand on the value once the rows are there.
          if (placed.current) return;
          placed.current = true;
          moveTo(standing.current, false);
        }}
        onScrollEndDrag={(event) => {
          // Let go without a fling: no momentum follows to say where it stopped.
          waitThenStop(event.nativeEvent.contentOffset.y);
        }}
        onMomentumScrollBegin={() => {
          if (settle.current !== null) clearTimeout(settle.current);
        }}
        onMomentumScrollEnd={(event) => {
          stoppedAt(event.nativeEvent.contentOffset.y);
        }}
        // The web scrolls and snaps on its own, then goes quiet: that is the stop.
        {...(Platform.OS === "web"
          ? {
              scrollEventThrottle: 16,
              onScroll: (event: { nativeEvent: { contentOffset: { y: number } } }) => {
                waitThenStop(event.nativeEvent.contentOffset.y);
              },
            }
          : {})}
        {...spinButton}
        style={[{ width, height: sizes.wheelRows * row }, webSnap.scroll]}
        contentContainerStyle={{ paddingVertical: around * row }}
      >
        <View {...(Platform.OS === "web" ? { "aria-hidden": true } : {})}>
          {values.map((option, position) => (
            <Pressable
              key={option}
              accessible={false}
              tabIndex={-1}
              onPress={() => {
                keepFocus();
                choose(position);
              }}
              style={[styles.row, { height: row }, webSnap.row]}
            >
              <Text
                style={[
                  typography.figure,
                  { color: position === index ? palette.text : palette.textMuted },
                ]}
              >
                {twoDigits(option)}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Adjustable>
  );
}

/**
 * The web has no snapToInterval; the browser's own scroll snapping stops
 * the wheel on a row, and keeps the page still at the wheel's ends.
 */
const webSnap: { readonly scroll: object; readonly row: object } =
  Platform.OS === "web"
    ? {
        scroll: { scrollSnapType: "y mandatory", overscrollBehavior: "contain" },
        row: { scrollSnapAlign: "center" },
      }
    : { scroll: {}, row: {} };

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  input: {
    minHeight: sizes.inputHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: controlOutline,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.ms,
  },
  value: { flex: 1 },
  wheel: {
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: controlOutline,
    borderRadius: radii.control,
  },
  columns: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  band: {
    position: "absolute",
    left: 0,
    right: 0,
    borderRadius: radii.control,
    pointerEvents: "none",
  },
  row: { alignItems: "center", justifyContent: "center" },
  hint: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
  hintText: { flex: 1 },
});
