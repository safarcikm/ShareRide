import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { minTouchTarget, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  /** Read by screen readers instead of the label, when the label is not enough. */
  readonly accessibilityLabel?: string;
  readonly variant?: "primary" | "secondary" | "text";
  /** Waiting for the API: shows a spinner and ignores presses. */
  readonly busy?: boolean;
  readonly disabled?: boolean;
}

export function Button({
  label,
  onPress,
  accessibilityLabel,
  variant = "primary",
  busy = false,
  disabled = false,
}: ButtonProps) {
  const palette = usePalette();
  const primary = variant === "primary";
  const inactive = busy || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary && { backgroundColor: palette.primary },
        variant === "secondary" && { borderColor: palette.border, borderWidth: 1 },
        variant === "text" && styles.text,
        (pressed || inactive) && styles.dimmed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? palette.onPrimary : palette.text} />
      ) : (
        <Text
          style={[
            typography.button,
            {
              color: primary
                ? palette.onPrimary
                : variant === "text"
                  ? palette.primary
                  : palette.text,
            },
          ]}
        >
          {label}
        </Text>
      )}
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
  text: { paddingHorizontal: spacing.sm, alignSelf: "flex-start" },
  dimmed: { opacity: 0.7 },
});
