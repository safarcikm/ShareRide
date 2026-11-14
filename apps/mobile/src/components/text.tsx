import type { ReactNode } from "react";
import { StyleSheet, Text } from "react-native";
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
