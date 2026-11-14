import { StyleSheet, Text, View } from "react-native";
import { radii, spacing, typography, type Palette } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

export type TagKind = "positive" | "warning" | "info" | "womenOnly";

/** Text and fill of each kind of tag (spec 15, section 4.1). */
function look(kind: TagKind, palette: Palette) {
  switch (kind) {
    case "positive":
      return { text: palette.primary, fill: palette.primarySoft };
    case "warning":
      return { text: palette.warning, fill: palette.warningSoft };
    case "info":
      return { text: palette.info, fill: palette.infoSoft };
    case "womenOnly":
      return { text: palette.womenOnly, fill: palette.womenOnlySoft };
  }
}

/**
 * A short label on a tinted fill, such as "Sample meeting point" or "Not in
 * use at the moment" (spec 15, section 5.2). The words carry the meaning;
 * the colour only repeats it.
 */
export function Tag({ label, kind }: { readonly label: string; readonly kind: TagKind }) {
  const palette = usePalette();
  const { text, fill } = look(kind, palette);
  return (
    <View testID="tag" style={[styles.tag, { backgroundColor: fill }]}>
      <Text style={[typography.caption, { color: text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: "flex-start",
    borderRadius: radii.tag,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
});
