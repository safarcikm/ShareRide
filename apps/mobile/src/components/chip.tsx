import { Check } from "lucide-react-native";
import { Pressable, StyleSheet, Text } from "react-native";
import {
  controlOutline,
  iconSizes,
  minTouchTarget,
  radii,
  sizes,
  spacing,
  typography,
} from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Icon } from "./icon";
import { spaceKeyPresses } from "./space-key";

/** Extra touch area above and below, so a 40 high chip is 44 to tap (spec 15, section 4.4). */
const slop = (minTouchTarget - sizes.chipHeight) / 2;
const hitSlop = { top: slop, bottom: slop, left: 0, right: 0 } as const;

/**
 * A choice that can be turned on and off, such as a spoken language
 * (`checkbox`, the default), one choice of several, such as a car's colour
 * (`radio`), or a suggestion that fills a field (`button`). A selected chip
 * shows a tick as well as its colour.
 */
export function Chip({
  label,
  selected,
  onToggle,
  role = "checkbox",
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onToggle: () => void;
  readonly role?: "checkbox" | "radio" | "button";
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      // aria-checked rather than accessibilityState, which the web build drops.
      aria-checked={role === "button" ? undefined : selected}
      onPress={onToggle}
      {...(role === "button" ? {} : spaceKeyPresses(onToggle))}
      hitSlop={hitSlop}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: palette.primarySoft, borderColor: palette.primary }
          : { backgroundColor: palette.surface, borderColor: palette.control },
      ]}
    >
      {selected ? (
        <Icon icon={Check} color={palette.primary} size={iconSizes.tick} testID="chip-tick" />
      ) : null}
      <Text
        style={[
          typography.label,
          styles.label,
          { color: selected ? palette.primary : palette.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: sizes.chipHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: controlOutline,
    borderRadius: radii.pill,
    alignSelf: "flex-start",
  },
  label: { flexShrink: 1 },
});
