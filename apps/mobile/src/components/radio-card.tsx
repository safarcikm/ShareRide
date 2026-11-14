import { Pressable, StyleSheet, Text, View } from "react-native";
import { chunky } from "@/theme/pressable";
import { controlOutline, edges, radii, sizes, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { spaceKeyPresses } from "./space-key";

/**
 * One choice of a few that each need a line of explanation, such as how
 * people book (spec 15, `RadioCard`): a card with a radio, a title and help.
 * Selected, its outline turns `primary` and the radio fills.
 */
export function RadioCard({
  title,
  help,
  selected,
  onSelect,
}: {
  readonly title: string;
  readonly help?: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={help === undefined ? title : `${title}. ${help}`}
      aria-checked={selected}
      onPress={onSelect}
      {...spaceKeyPresses(onSelect)}
      style={({ pressed }) => [styles.outer, chunky(edges.card, palette.edge, pressed).outer]}
    >
      {({ pressed }) => (
        <View
          testID="radio-card-face"
          style={[
            styles.face,
            {
              backgroundColor: palette.surface,
              borderColor: selected ? palette.primary : palette.surface,
            },
            chunky(edges.card, palette.edge, pressed).face,
          ]}
        >
          <View
            style={[styles.radio, { borderColor: selected ? palette.primary : palette.control }]}
          >
            {selected ? (
              <View testID="radio-dot" style={[styles.dot, { backgroundColor: palette.primary }]} />
            ) : null}
          </View>
          <View style={styles.texts}>
            <Text style={[typography.bodyStrong, { color: palette.text }]}>{title}</Text>
            {help === undefined ? null : (
              <Text style={[typography.small, { color: palette.textMuted }]}>{help}</Text>
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: { borderRadius: radii.card },
  face: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.ms,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: controlOutline,
  },
  radio: {
    width: sizes.radio,
    height: sizes.radio,
    borderRadius: radii.pill,
    borderWidth: controlOutline,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { width: sizes.radio / 2, height: sizes.radio / 2, borderRadius: radii.pill },
  texts: { flex: 1, gap: spacing.xs / 2 },
});
