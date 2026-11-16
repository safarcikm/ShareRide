import { router, type Href } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { minTouchTarget, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * A link to another screen, read out as a link by screen readers. Always
 * underlined: moss on basalt text is only 2.3:1, so the underline is what
 * marks it as a link (spec 15, section 5.1).
 */
export function TextLink({
  label,
  href,
  accessibilityLabel,
  align = "center",
}: {
  readonly label: string;
  readonly href: Href;
  /** Read instead of the label when the label needs its context, such as "Edit: Route". */
  readonly accessibilityLabel?: string;
  /** In a settings row, it starts at the left with the row's text (spec 16, 3.8). */
  readonly align?: "center" | "start";
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={() => {
        router.push(href);
      }}
      style={[styles.link, align === "start" && styles.start]}
    >
      <Text style={[typography.bodyStrong, styles.text, { color: palette.primary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: minTouchTarget, justifyContent: "center", alignSelf: "center" },
  start: { alignSelf: "flex-start" },
  text: { textDecorationLine: "underline" },
});
