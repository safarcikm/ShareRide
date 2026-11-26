import { Pressable, StyleSheet, Text, View } from "react-native";
import { useInActionRows } from "@/components/action-rows";
import { useLanguage } from "@/i18n/language";
import { linkProps, type AppPath } from "@/navigation/link-props";
import { useHover } from "@/theme/hover";
import { ringInside } from "@/theme/ring-inside";
import { sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/**
 * A part of a ride on "Check and publish" (spec 31, 3.11, item 3): a small
 * caption over what is set, each of its `lines` on its own, and "Change"
 * at the right. The whole row is the link to the step that sets it, and a
 * screen reader hears "Route, Mjódd to Vík, with 5 stops on the way,
 * Change": the lines, or `spoken` where they are read out otherwise, as an
 * arrow is a word aloud. It goes in `ActionRows`, as a `Row` does, whose
 * shape it is not: a `Row` has its title first and what is set after it.
 */
export function CheckRow({
  caption,
  lines,
  spoken = lines.join(", "),
  href,
}: {
  readonly caption: string;
  readonly lines: readonly string[];
  readonly spoken?: string | undefined;
  readonly href: AppPath;
}) {
  const { t } = useLanguage();
  const palette = usePalette();
  const inRows = useInActionRows();
  const [hovered, hover] = useHover();
  const change = t("trip.change");
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={[caption, spoken, change].join(", ")}
      {...linkProps(href)}
      {...hover}
      {...(inRows ? ringInside : null)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed || hovered ? palette.primarySoft : palette.surface },
      ]}
    >
      <View testID="check-row-words" style={styles.words}>
        <Text style={[typography.caption, { color: palette.textMuted }]}>{caption}</Text>
        {lines.map((line, index) => (
          <Text key={`${String(index)}-${line}`} style={[typography.body, { color: palette.text }]}>
            {line}
          </Text>
        ))}
      </View>
      <Text style={[typography.label, { color: palette.primary }]}>{change}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: sizes.row,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.ms,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  // What is set breaks into lines; "Change" keeps its width.
  words: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
});
