import type { Href } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { sectionLevel } from "@/components/text";
import { TextLink } from "@/components/text-link";
import { spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

interface SectionLink {
  readonly label: string;
  /** Read instead of the label when it needs the title, such as "Edit: Route". */
  readonly accessibilityLabel?: string;
  readonly href: Href;
}

/**
 * A part of a trip's summary: its title, what it holds now, and a link
 * that opens the screen to change it, as on posting's review and on Edit
 * trip (spec 6, 3.2); `more` is a second way to change it, under what it
 * holds, such as removing a stop.
 */
export function SummarySection({
  title,
  lines,
  link,
  more,
}: {
  readonly title: string;
  readonly lines: readonly string[];
  readonly link: SectionLink;
  readonly more?: SectionLink | undefined;
}) {
  const palette = usePalette();
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text
          accessibilityRole="header"
          {...sectionLevel}
          style={[typography.label, styles.title, { color: palette.textMuted }]}
        >
          {title}
        </Text>
        <TextLink {...link} />
      </View>
      {lines.map((line, index) => (
        <Text key={`${String(index)}-${line}`} style={[typography.body, { color: palette.text }]}>
          {line}
        </Text>
      ))}
      {more === undefined ? null : (
        <View style={styles.more}>
          <TextLink {...more} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.xs },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { flex: 1 },
  more: { alignItems: "flex-start" },
});
