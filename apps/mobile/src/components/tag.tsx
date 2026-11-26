import type { LucideIcon } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { iconSizes, radii, spacing, typography, type Palette } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Icon } from "./icon";

export type TagKind = "positive" | "warning" | "info" | "womenOnly" | "plain" | "problem";

/**
 * Text and fill of each kind of tag (spec 15, section 4.1). What the
 * colours say (spec 31, 3.2, rule 6): moss is good news or what you can
 * do, amber is yours and now, blue is waiting and information, red is a
 * problem, and `plain` asks nothing of anyone.
 */
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
    case "plain":
      return { text: palette.textMuted, fill: palette.background };
    case "problem":
      return { text: palette.error, fill: palette.errorSoft };
  }
}

/**
 * A short label on a tinted fill, such as "Sample meeting point" or "Not in
 * use at the moment" (spec 15, section 5.2), with an icon before it when it
 * is given one. The words carry the meaning; the colour and the icon only
 * repeat it. `onTint` is for a tag on a card in its own tint, such as "No
 * reviews yet" on a request in the car's yellow: its fill would not show
 * there, so it stands on the white of a surface, as a ticket does.
 */
export function Tag({
  label,
  kind,
  icon,
  onTint = false,
}: {
  readonly label: string;
  readonly kind: TagKind;
  readonly icon?: LucideIcon | undefined;
  readonly onTint?: boolean;
}) {
  const palette = usePalette();
  const { text, fill } = look(kind, palette);
  return (
    <View testID="tag" style={[styles.tag, { backgroundColor: onTint ? palette.surface : fill }]}>
      {icon === undefined ? null : (
        <Icon testID="tag-icon" icon={icon} color={text} size={iconSizes.tick} />
      )}
      <Text style={[typography.caption, styles.label, { color: text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radii.tag,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
  },
  // A label too long for one line wraps beside the icon instead of running past the tag.
  label: { flexShrink: 1 },
});
