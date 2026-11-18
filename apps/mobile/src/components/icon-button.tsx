import type { LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { useHover } from "@/theme/hover";
import { chunky } from "@/theme/pressable";
import { edges, radii, sizes } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Icon } from "./icon";

/**
 * A round 44 button with only an icon, such as back, swap or the next month
 * (spec 15, `IconButton`). The label is its accessible name. A disabled
 * button loses its edge and its icon turns muted. Under the pointer the
 * button is tinted `primarySoft` (spec 18, 3.4).
 */
export function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
  faceTestID,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly faceTestID?: string;
}) {
  const palette = usePalette();
  const edge = disabled ? 0 : edges.card;
  const [hovered, hover] = useHover(disabled);
  const fill = disabled ? palette.border : hovered ? palette.primarySoft : palette.surface;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      {...hover}
      style={({ pressed }) => [styles.outer, chunky(edge, palette.edge, pressed).outer]}
    >
      {({ pressed }) => (
        <View
          testID={faceTestID}
          style={[styles.face, { backgroundColor: fill }, chunky(edge, palette.edge, pressed).face]}
        >
          <Icon icon={icon} color={disabled ? palette.textMuted : palette.text} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: sizes.iconButton,
    height: sizes.iconButton,
    borderRadius: radii.pill,
    alignSelf: "flex-start",
  },
  face: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: radii.pill },
});
