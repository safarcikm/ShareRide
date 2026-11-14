import { CircleAlert } from "lucide-react-native";
import { useEffect } from "react";
import { AccessibilityInfo, Platform, StyleSheet, Text, View } from "react-native";
import { iconSizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Icon } from "./icon";

/**
 * What is wrong with a choice that is not a text field, such as a group of
 * chips or a tick box: red text after an alert icon, as under a text field
 * (spec 15, section 5.1). It is read out when it appears: as an alert on the
 * web, and announced on phones, where a new live region is not.
 */
export function FieldError({ message }: { readonly message: string | undefined }) {
  const palette = usePalette();
  useEffect(() => {
    if (message !== undefined && Platform.OS !== "web") {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [message]);
  if (message === undefined) return null;
  return (
    <View accessible accessibilityRole="alert" style={styles.row}>
      <Icon
        icon={CircleAlert}
        color={palette.error}
        size={iconSizes.inline}
        testID="field-error-icon"
      />
      <Text style={[typography.small, styles.text, { color: palette.error }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
  text: { flex: 1 },
});
