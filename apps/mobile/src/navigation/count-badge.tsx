import { StyleSheet, Text, View } from "react-native";
import { controlOutline, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

/** What the badge says: the count, or "9+" above nine. */
export function badgeText(count: number): string {
  return count > 9 ? "9+" : String(count);
}

/**
 * The unread count on Messages in the menu (spec 7, 3.1, item 9):
 * `onPrimary` figures on a `primary` pill with a 2 `surface` ring, so it
 * stands apart from the icon under it. Nothing at zero. Screen readers skip
 * it: the place's name says the count.
 */
export function CountBadge({ count }: { readonly count: number }) {
  const palette = usePalette();
  if (count <= 0) return null;
  return (
    <View
      testID="count-badge"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={[styles.badge, { backgroundColor: palette.primary, borderColor: palette.surface }]}
    >
      <Text style={[typography.caption, styles.figure, { color: palette.onPrimary }]}>
        {badgeText(count)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: sizes.badge,
    minHeight: sizes.badge,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: controlOutline,
    alignItems: "center",
    justifyContent: "center",
  },
  figure: { textAlign: "center" },
});
