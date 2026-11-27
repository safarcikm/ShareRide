import { useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type LayoutChangeEvent,
  type LayoutRectangle,
} from "react-native";
import Svg, { Line } from "react-native-svg";
import { useLanguage } from "@/i18n/language";
import { controlOutline, icelandScene, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { carHeight, PuffinsInCar } from "./puffin-scenes";

/**
 * Where things stand, as a road (spec 31, 3.2, rule 2, and 3.3): a grey
 * road with a dashed middle line, a mark at each step, the puffins' car on
 * the step you are on and the road behind it in moss; under it the steps'
 * names, the current one in the text colour. A booking goes Asked,
 * Confirmed, Trip day, Done; offering a ride goes Route, Time, Seats,
 * Price, Check.
 *
 * It is a picture with one line for screen readers, "Step 2 of 4:
 * Confirmed". Its marks are not links.
 *
 * Where the names have no room, as with text twice as large on a narrow
 * phone, that line stands under the road in their place, for the eye too.
 */
export function Road({
  steps,
  current,
}: {
  /** The steps' names, in order. */
  readonly steps: readonly string[];
  /** The step the car stands on, from 0; past either end it stands on that end. */
  readonly current: number;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const land = icelandScene[useColorScheme() === "dark" ? "dark" : "light"];
  const last = Math.max(steps.length - 1, 1);
  const at = Math.min(Math.max(Math.trunc(current), 0), steps.length - 1);
  const spot = (index: number) => `${String((index / last) * 100)}%` as const;
  const gone = { backgroundColor: palette.primary };
  const now = t("road.step", { step: at + 1, total: steps.length, name: steps[at] ?? "" });
  const room = useRoomForNames(steps.length);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={now}>
      <View
        aria-hidden
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.picture}
      >
        <View style={styles.road}>
          <View testID="road-lane" style={[styles.lane, { backgroundColor: land.road }]}>
            <Svg width="100%" height={controlOutline}>
              <Line
                x1={0}
                y1={controlOutline / 2}
                x2="100%"
                y2={controlOutline / 2}
                stroke={land.roadLine}
                strokeWidth={controlOutline}
                strokeDasharray="8 6"
              />
            </Svg>
          </View>
          {at <= 0 ? null : (
            <>
              <View testID="road-lead" style={[styles.lead, gone]} />
              <View testID="road-gone" style={[styles.gone, gone, { width: spot(at) }]} />
            </>
          )}
          {steps.map((_, index) =>
            index === at ? null : (
              <View
                key={index}
                testID="road-mark"
                style={[
                  styles.mark,
                  {
                    left: spot(index),
                    backgroundColor: palette.surface,
                    borderColor: index < at ? palette.surface : palette.control,
                  },
                ]}
              />
            ),
          )}
          <View testID="road-car" style={[styles.car, { left: spot(Math.max(at, 0)) }]}>
            <PuffinsInCar width={sizes.roadCar} />
          </View>
        </View>
        <View
          testID="road-names"
          onLayout={room.road}
          style={[styles.names, room.none ? styles.unseen : null]}
        >
          <Text
            testID="road-one-line"
            numberOfLines={1}
            onLayout={room.line}
            style={[typography.caption, styles.oneLine]}
          >
            {oneLine}
          </Text>
          {steps.map((name, index) => (
            <Text
              key={index}
              testID="road-name"
              onLayout={room.name(index)}
              style={[
                typography.caption,
                index === 0 ? styles.first : index === steps.length - 1 ? styles.last : styles.name,
                { color: index === at ? palette.text : palette.textMuted },
              ]}
            >
              {name}
            </Text>
          ))}
        </View>
        {room.none ? (
          <Text testID="road-now" style={[typography.caption, { color: palette.text }]}>
            {now}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** A line with no word on it: a space that is not left out. */
const oneLine = "\u00A0";

/** A size may differ by a part of a point from one measuring to the next. */
const about = 1;

/**
 * Whether the names have room under the road, from how they were laid
 * out. They have none when one of them takes more than a line, as a phone
 * breaks a word too long for its place, or when they are wider than the
 * road together, as a browser keeps each word whole and lets it run out.
 * The web tells each width as a whole number, and some browsers round each
 * alone: names that fill the road can count up to half a point wider
 * each, which is allowed for. Nothing is decided before the road, a line
 * and every name are measured, nor from a size of nothing, which the web
 * tells of a screen under another. The names go on being measured while
 * out of sight, so they come back when they have room again.
 */
function useRoomForNames(count: number) {
  const seen = useRef<{
    road: number | null;
    line: number | null;
    names: (LayoutRectangle | undefined)[];
  }>({ road: null, line: null, names: [] });
  const [none, setNone] = useState(false);
  const decide = () => {
    const { road, line } = seen.current;
    const names = seen.current.names.slice(0, count).filter((name) => name !== undefined);
    if (road === null || line === null || names.length < count) return;
    const measured = [road, line, ...names.flatMap((name) => [name.width, name.height])];
    if (measured.some((size) => size <= 0)) return;
    const wide = names.reduce((sum, name) => sum + name.width, spacing.sm * (count - 1));
    setNone(wide > road + about + count / 2 || names.some((name) => name.height > line + about));
  };
  return {
    none,
    road: (event: LayoutChangeEvent) => {
      seen.current.road = event.nativeEvent.layout.width;
      decide();
    },
    line: (event: LayoutChangeEvent) => {
      seen.current.line = event.nativeEvent.layout.height;
      decide();
    },
    name: (index: number) => (event: LayoutChangeEvent) => {
      seen.current.names[index] = event.nativeEvent.layout;
      decide();
    },
  };
}

/** How far the road runs on past its first and its last step: half a car. */
const past = sizes.roadCar / 2;

const styles = StyleSheet.create({
  picture: { gap: spacing.xs },
  // The steps stand between the two ends of this box; the lane runs on past them.
  road: { height: spacing.xs + carHeight(sizes.roadCar), marginHorizontal: past },
  lane: {
    position: "absolute",
    left: -past,
    right: -past,
    bottom: 0,
    height: sizes.road,
    borderRadius: radii.pill,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  lead: {
    position: "absolute",
    left: -past,
    bottom: 0,
    width: past,
    height: sizes.road,
    borderTopLeftRadius: radii.pill,
    borderBottomLeftRadius: radii.pill,
  },
  gone: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: sizes.road,
    borderTopRightRadius: radii.pill,
    borderBottomRightRadius: radii.pill,
  },
  mark: {
    position: "absolute",
    bottom: (sizes.road - sizes.roadMark) / 2,
    marginLeft: -sizes.roadMark / 2,
    width: sizes.roadMark,
    height: sizes.roadMark,
    borderRadius: radii.pill,
    borderWidth: controlOutline,
  },
  // Its wheels stand on the road's middle line.
  car: { position: "absolute", bottom: spacing.xs, marginLeft: -past },
  // Each name under its mark: the first and the last start and end with the
  // road, the others are centred on theirs, and the same gap between every
  // two keeps them there and apart.
  names: { flexDirection: "row", alignItems: "flex-start", columnGap: spacing.sm },
  // With no room, the names stay to be measured: over the picture, not seen,
  // and cut where they run out of it, so the page is no wider for them.
  unseen: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden",
    opacity: 0,
  },
  // How high one line of a name is, with the phone's text size.
  oneLine: { position: "absolute", opacity: 0 },
  first: { flexGrow: 1, flexShrink: 1, flexBasis: past, textAlign: "left" },
  name: { flexGrow: 2, flexShrink: 1, flexBasis: 0, textAlign: "center" },
  last: { flexGrow: 1, flexShrink: 1, flexBasis: past, textAlign: "right" },
});
