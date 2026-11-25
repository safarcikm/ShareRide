import type { LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { useHover } from "@/theme/hover";
import { chunky } from "@/theme/pressable";
import { edges, iconSizes, radii, sizes } from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";
import { Icon } from "./icon";

/**
 * A round 44 button with only an icon, such as back, swap or the next month
 * (spec 15, `IconButton`). The label is its accessible name. A disabled
 * button loses its edge and its icon turns muted. Under the pointer the
 * button is tinted `primarySoft` (spec 18, 3.4).
 *
 * A `quiet` one is drawn 36 round in its 44 tap area, without fill or edge
 * and with its icon in `textMuted`, for a corner of a card (spec 28, 3.1).
 * The whole 44 is the button: the web has no `hitSlop`.
 */
export function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
  quiet = false,
  faceTestID,
  onHoverIn,
  onHoverOut,
  onFocus,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly quiet?: boolean;
  readonly faceTestID?: string;
  /** Told too when the pointer or the keyboard comes and goes, as a card's corner tells its card. */
  readonly onHoverIn?: () => void;
  readonly onHoverOut?: () => void;
  readonly onFocus?: () => void;
}) {
  const palette = usePalette();
  const edge = disabled || quiet ? 0 : edges.card;
  const [hovered, hover] = useHover(disabled);
  const tint = (pressed: boolean) => {
    if (disabled) return palette.border;
    if (hovered || (quiet && pressed)) return palette.primarySoft;
    return quiet ? undefined : palette.surface;
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => {
        hover.onHoverIn();
        onHoverIn?.();
      }}
      onHoverOut={() => {
        hover.onHoverOut();
        onHoverOut?.();
      }}
      onFocus={onFocus}
      style={({ pressed }) => [
        styles.outer,
        quiet && styles.quietOuter,
        chunky(edge, palette.edge, pressed).outer,
      ]}
    >
      {({ pressed }) => (
        <View
          testID={faceTestID}
          style={[
            quiet ? styles.quietFace : styles.face,
            { backgroundColor: tint(pressed) },
            chunky(edge, palette.edge, pressed).face,
          ]}
        >
          <Icon
            icon={icon}
            color={disabled || quiet ? palette.textMuted : palette.text}
            size={quiet ? iconSizes.inline : iconSizes.button}
          />
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
  quietOuter: { alignItems: "center", justifyContent: "center" },
  face: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: radii.pill },
  // Not `flex`, which on the web would give it no height in its 44 button.
  quietFace: {
    width: sizes.iconButtonSmall,
    height: sizes.iconButtonSmall,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
  },
});
