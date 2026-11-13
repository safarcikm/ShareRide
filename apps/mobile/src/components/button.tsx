import { Pressable, StyleSheet, Text } from "react-native";
import { minTouchTarget, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  /** Read by screen readers instead of the label, when the label is not enough. */
  readonly accessibilityLabel?: string;
  readonly variant?: "primary" | "secondary";
}

export function Button({ label, onPress, accessibilityLabel, variant = "primary" }: ButtonProps) {
  const palette = usePalette();
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: palette.primary }
          : { borderColor: palette.border, borderWidth: 1 },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[typography.button, { color: primary ? palette.onPrimary : palette.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: minTouchTarget,
    minWidth: minTouchTarget,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.8 },
});
