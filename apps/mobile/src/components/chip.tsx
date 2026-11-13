import { Pressable, StyleSheet, Text } from "react-native";
import { minTouchTarget, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/** A choice that can be turned on and off, such as a spoken language. */
export function Chip({
  label,
  selected,
  onToggle,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onToggle: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onToggle}
      style={[
        styles.chip,
        { borderColor: selected ? palette.primary : palette.border },
        selected && { backgroundColor: palette.primary },
      ]}
    >
      <Text style={[typography.small, { color: selected ? palette.onPrimary : palette.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderRadius: 22,
    justifyContent: "center",
  },
});
