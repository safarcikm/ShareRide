import { StyleSheet, Text, useColorScheme, View } from "react-native";
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
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t("road.step", {
        step: at + 1,
        total: steps.length,
        name: steps[at] ?? "",
      })}
    >
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
        <View style={styles.names}>
          {steps.map((name, index) => (
            <Text
              key={index}
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
      </View>
    </View>
  );
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
  // road, the others are centred on theirs.
  names: { flexDirection: "row" },
  first: { flexGrow: 1, flexShrink: 1, flexBasis: past, textAlign: "left" },
  name: { flexGrow: 2, flexShrink: 1, flexBasis: 0, textAlign: "center" },
  last: { flexGrow: 1, flexShrink: 1, flexBasis: past, textAlign: "right" },
});
