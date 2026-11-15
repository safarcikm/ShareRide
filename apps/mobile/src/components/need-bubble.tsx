import type { LucideIcon } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { controlOutline, iconSizes, people, radii, spacing, typography } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Icon } from "./icon";

/**
 * A trip preference as a pill with a round icon in a people colour and a
 * word (spec 15, `NeedBubble`). The word carries the meaning.
 */
export function NeedBubble({
  icon,
  colour,
  label,
}: {
  readonly icon: LucideIcon;
  /** One of the people colours. */
  readonly colour: string;
  readonly label: string;
}) {
  const palette = usePalette();
  return (
    <View style={[styles.bubble, { borderColor: palette.border }]}>
      <View style={[styles.icon, { backgroundColor: colour }]}>
        <Icon icon={icon} color={people.face} size={iconSizes.tick} />
      </View>
      <Text style={[typography.label, styles.label, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: controlOutline,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    paddingLeft: spacing.xs,
    paddingRight: spacing.ms,
  },
  icon: {
    width: spacing.xl,
    height: spacing.xl,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { flexShrink: 1 },
});
