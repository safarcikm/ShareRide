import { StyleSheet, Text, View } from "react-native";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/** A message about the last action, read out by screen readers when it appears. */
export function Notice({
  message,
  kind = "error",
}: {
  readonly message: string | null;
  readonly kind?: "error" | "info";
}) {
  const palette = usePalette();
  if (message === null) return null;
  const color = kind === "error" ? palette.error : palette.text;
  return (
    <View
      accessibilityRole={kind === "error" ? "alert" : "text"}
      accessibilityLiveRegion="polite"
      style={[styles.notice, { borderColor: color, backgroundColor: palette.surface }]}
    >
      <Text style={[typography.body, { color }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { borderLeftWidth: 4, borderRadius: 8, padding: spacing.md },
});
