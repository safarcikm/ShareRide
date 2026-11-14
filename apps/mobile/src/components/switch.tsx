import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { controlOutline, minTouchTarget, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { spaceKeyPresses } from "./space-key";

/**
 * Something that is on or off, such as a stop on the way (spec 15,
 * `Switch`): the label at the left, the track at the right. Off is a
 * `control` outline with a grey thumb at the start; on is a `primary` track
 * with the thumb at the end. The whole row is the touch target. `below`
 * shows under the label, such as a warning tag; a screen reader hears only
 * `spokenLabel`, so it should say what `below` says too.
 */
export function Switch({
  label,
  value,
  onChange,
  below,
  spokenLabel = label,
}: {
  readonly label: string;
  readonly spokenLabel?: string;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  readonly below?: ReactNode;
}) {
  const palette = usePalette();
  const toggle = () => {
    onChange(!value);
  };
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={spokenLabel}
      // aria-checked rather than accessibilityState, which the web build drops.
      aria-checked={value}
      onPress={toggle}
      {...spaceKeyPresses(toggle)}
      style={styles.row}
    >
      <View style={styles.texts}>
        <Text style={[typography.body, { color: value ? palette.text : palette.textMuted }]}>
          {label}
        </Text>
        {below}
      </View>
      <View
        testID="switch-track"
        style={[
          styles.track,
          value
            ? { backgroundColor: palette.primary, borderColor: palette.primary }
            : { backgroundColor: palette.surface, borderColor: palette.control },
        ]}
      >
        <View
          testID="switch-thumb"
          style={[
            styles.thumb,
            value
              ? { backgroundColor: palette.onPrimary, alignSelf: "flex-end" }
              : { backgroundColor: palette.control, alignSelf: "flex-start" },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.ms, minHeight: minTouchTarget },
  texts: { flex: 1, gap: spacing.xs, alignItems: "flex-start" },
  track: {
    width: sizes.switchWidth,
    height: sizes.switchHeight,
    borderRadius: radii.pill,
    borderWidth: controlOutline,
    justifyContent: "center",
    paddingHorizontal: (sizes.switchHeight - 2 * controlOutline - sizes.switchThumb) / 2,
  },
  thumb: { width: sizes.switchThumb, height: sizes.switchThumb, borderRadius: radii.pill },
});
