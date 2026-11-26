import { CircleAlert, Info } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { iconSizes, radii, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Icon } from "./icon";
import { TakesFocus } from "./takes-focus";

/**
 * A message about the last action, read out by screen readers when it
 * appears. An error sits on the error fill with an alert icon, information on
 * the info fill with an info icon (spec 15, section 5.1).
 */
export function Notice({
  message,
  kind = "error",
  urgent = kind === "error",
  selectable = false,
}: {
  readonly message: string | null;
  readonly kind?: "error" | "info";
  /** Read out at once, as an alert: errors, and information that needs an answer. */
  readonly urgent?: boolean;
  /** Lets the person select and copy the text, such as a link to share by hand. */
  readonly selectable?: boolean;
}) {
  const palette = usePalette();
  if (message === null) return null;
  const isError = kind === "error";
  return (
    <View
      testID="notice"
      accessible
      accessibilityRole={urgent ? "alert" : "text"}
      accessibilityLiveRegion="polite"
      style={[styles.notice, { backgroundColor: isError ? palette.errorSoft : palette.infoSoft }]}
    >
      <Icon
        icon={isError ? CircleAlert : Info}
        color={isError ? palette.error : palette.text}
        size={iconSizes.button}
      />
      <Text
        selectable={selectable}
        style={[typography.body, styles.message, { color: palette.text }]}
      >
        {message}
      </Text>
    </View>
  );
}

/**
 * Why a screen's main button did not do what it says, over that button: in
 * the bar it is seen without scrolling, on a phone too (spec 31, 3.8 and
 * 3.19). It takes focus when it appears and each time it says something new.
 */
export function ActionNotice({ message }: { readonly message: string | null }) {
  if (message === null) return null;
  return (
    <TakesFocus key={message}>
      <Notice message={message} />
    </TakesFocus>
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
