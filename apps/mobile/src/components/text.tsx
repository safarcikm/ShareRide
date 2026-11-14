import type { ReactNode } from "react";
import { Platform, StyleSheet, Text } from "react-native";
import { typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/** A screen's title, centred, read out as a heading. */
export function Title({ children }: { readonly children: ReactNode }) {
  const palette = usePalette();
  return (
    <Text
      accessibilityRole="header"
      style={[typography.title, styles.centre, { color: palette.text }]}
    >
      {children}
    </Text>
  );
}

/**
 * On the web a heading without a level is an h1, like the title; section
 * headings are h2, so screen readers can move through a screen's parts.
 * React Native's types do not know aria-level; react-native-web reads it.
 */
const sectionLevel: object = Platform.OS === "web" ? { "aria-level": 2 } : {};

/** A section or card heading, at the left, read out as a heading. */
export function Heading({ children }: { readonly children: ReactNode }) {
  const palette = usePalette();
  return (
    <Text
      accessibilityRole="header"
      {...sectionLevel}
      style={[typography.heading, { color: palette.text }]}
    >
      {children}
    </Text>
  );
}

/**
 * Secondary text, centred under a title. Long text that people read line by
 * line, such as a legal document, starts at the left (`align="start"`).
 */
export function Body({
  children,
  align = "center",
}: {
  readonly children: ReactNode;
  readonly align?: "center" | "start";
}) {
  const palette = usePalette();
  return (
    <Text
      style={[typography.body, align === "center" && styles.centre, { color: palette.textMuted }]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({ centre: { textAlign: "center" } });
