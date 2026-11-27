import type { ReactNode } from "react";
import { Platform, StyleSheet, Text } from "react-native";
import { typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * On the web a heading without a level is an h1, like the title; section
 * headings are h2, so screen readers can move through a screen's parts.
 * React Native's types do not know aria-level; react-native-web reads it.
 */
export const sectionLevel: object = Platform.OS === "web" ? { "aria-level": 2 } : {};

/**
 * A screen's title, centred, read out as a heading. A title that heads a
 * block of facts about a trip, with its date and status, starts at the left
 * like them (`align="start"`), as on trip details. A title of a `part` of
 * a screen that has its own title, such as the open conversation beside
 * Messages on a wide screen, looks the same and is an h2 on the web. The
 * front page's title on a wide page is `large`, on its scene (spec 31,
 * 3.16).
 */
export function Title({
  children,
  align = "center",
  part = false,
  large = false,
}: {
  readonly children: ReactNode;
  readonly align?: "center" | "start";
  readonly part?: boolean;
  readonly large?: boolean;
}) {
  const palette = usePalette();
  return (
    <Text
      accessibilityRole="header"
      {...(part ? sectionLevel : {})}
      style={[
        large ? typography.display : typography.title,
        align === "center" && styles.centre,
        { color: palette.text },
      ]}
    >
      {children}
    </Text>
  );
}

/** A section or card heading, at the left, read out as a heading. */
export function Heading({
  children,
  level = 2,
}: {
  readonly children: ReactNode;
  /** A heading inside a section with its own heading is a level 3 (an h3 on the web). */
  readonly level?: 2 | 3;
}) {
  const palette = usePalette();
  return (
    <Text
      accessibilityRole="header"
      {...(level === 2 || Platform.OS !== "web" ? sectionLevel : { "aria-level": 3 })}
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
