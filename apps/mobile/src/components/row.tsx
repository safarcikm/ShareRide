import { ChevronRight } from "lucide-react-native";
import { Pressable, StyleSheet, Text } from "react-native";
import { radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Icon } from "./icon";

/**
 * A `Row` that opens a screen, such as My cars on Profile (spec 15, section
 * 5.2): the title on the left in `bodyStrong`, a value such as "Confirmed"
 * in `small` `textMuted`, and a chevron; at least 56 high, tinted
 * `primarySoft` while pressed. Rows go in a `Card`.
 */
export function Row({
  title,
  value,
  onPress,
}: {
  readonly title: string;
  readonly value?: string;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value === undefined ? title : `${title}, ${value}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: palette.primarySoft } : null,
      ]}
    >
      <Text style={[typography.bodyStrong, styles.title, { color: palette.text }]}>{title}</Text>
      {value === undefined ? null : (
        <Text style={[typography.small, styles.value, { color: palette.textMuted }]}>{value}</Text>
      )}
      <Icon icon={ChevronRight} color={palette.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The tint reaches a little past the text, inside the card's padding.
  row: {
    minHeight: sizes.row,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radii.control,
    paddingHorizontal: spacing.sm,
    marginHorizontal: -spacing.sm,
  },
  title: { flex: 1 },
  value: { flexShrink: 1, textAlign: "right" },
});
