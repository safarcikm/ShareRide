import { Pressable, StyleSheet, Text } from "react-native";
import { externalLinkProps, linkProps, type AppPath } from "@/navigation/link-props";
import { minTouchTarget, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * A link to another screen, to a page outside the app or a `mailto:`
 * address at `url` (spec 30, 3.1), or one opened by `onPress`, read out as
 * a link by screen readers. A screen's link is an `<a href>` on
 * the web, which search engines follow (spec 23, 3.6). Always
 * underlined: moss on basalt text is only 2.3:1, so the underline is what
 * marks it as a link (spec 15, section 5.1).
 */
export function TextLink({
  label,
  href,
  url,
  onPress,
  accessibilityLabel,
  align = "center",
}: {
  readonly label: string;
  /** Read instead of the label when the label needs its context, such as "Edit: Route". */
  readonly accessibilityLabel?: string;
  /** In a settings row, it starts at the left with the row's text (spec 16, 3.8). */
  readonly align?: "center" | "start";
} & (
  | { readonly href: AppPath; readonly url?: never; readonly onPress?: never }
  | { readonly url: string; readonly href?: never; readonly onPress?: never }
  | { readonly onPress: () => void; readonly href?: never; readonly url?: never }
)) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      {...(href !== undefined
        ? linkProps(href)
        : url !== undefined
          ? externalLinkProps(url)
          : { onPress })}
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
