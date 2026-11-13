import { CircleAlert, Info } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { radii, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Icon } from "./icon";

/**
 * A message about the last action, read out by screen readers when it
 * appears. An error sits on the error fill with an alert icon, information on
 * the info fill with an info icon (spec 15, section 5.1).
 */
export function Notice({
  message,
  kind = "error",
}: {
  readonly message: string | null;
  readonly kind?: "error" | "info";
}) {
  const palette = usePalette();
  if (message === null) return null;
  const isError = kind === "error";
  return (
    <View
      testID="notice"
      accessible
      accessibilityRole={isError ? "alert" : "text"}
      accessibilityLiveRegion="polite"
      style={[styles.notice, { backgroundColor: isError ? palette.errorSoft : palette.infoSoft }]}
    >
      <Icon
        icon={isError ? CircleAlert : Info}
        color={isError ? palette.error : palette.focus}
        size={22}
      />
      <Text style={[typography.body, styles.message, { color: palette.text }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderRadius: radii.control,
    padding: spacing.md,
  },
  message: { flex: 1 },
});
