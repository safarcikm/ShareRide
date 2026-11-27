import type { LucideIcon } from "lucide-react-native";
import type { ComponentRef, Ref } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
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
 * and with its icon in `textMuted`, for a corner of a card (spec 28, 3.1)
 * and in a bar that stays, as a conversation's top is (spec 31, 3.13).
 * There Back, which leads away, is `strong`: its icon keeps the text's
 * colour and its size. The whole 44 is the button: the web has no
 * `hitSlop`.
 *
 * A `filled` one is a screen's main button where a word has no room, as
 * Send is beside the field of a conversation (spec 31, 3.13): round and as
 * high as the field, in moss with the main button's edge, and counted as
 * the screen's one filled button (R31.1). While `busy` it shows a spinner
 * and ignores presses. A button is plain, `quiet` or `filled`, never two
 * of them, and only a quiet one is `strong`.
 *
 * One that opens and closes something under it says whether it is open
 * (`expanded`), as the menu of a conversation's top does; its `ref` lets
 * focus come back to it when that closes another way.
 */
export function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
  quiet = false,
  strong = false,
  filled = false,
  busy = false,
  expanded,
  faceTestID,
  onHoverIn,
  onHoverOut,
  onFocus,
  ref,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly quiet?: boolean;
  readonly strong?: boolean;
  readonly filled?: boolean;
  readonly busy?: boolean;
  readonly expanded?: boolean;
  readonly faceTestID?: string;
  /** Told too when the pointer or the keyboard comes and goes, as a card's corner tells its card. */
  readonly onHoverIn?: () => void;
  readonly onHoverOut?: () => void;
  readonly onFocus?: () => void;
  readonly ref?: Ref<ComponentRef<typeof Pressable>>;
}) {
  const palette = usePalette();
  const inactive = disabled || busy;
  const edge = disabled || quiet ? 0 : filled ? edges.buttonPrimary : edges.card;
  const edgeColor = filled ? palette.primaryEdge : palette.edge;
  const [hovered, hover] = useHover(inactive);
  const tint = (pressed: boolean) => {
    if (disabled) return palette.border;
    if (filled) return hovered ? palette.primaryHover : palette.primary;
    if (hovered || (quiet && pressed)) return palette.primarySoft;
    return quiet ? undefined : palette.surface;
  };
  // A quiet icon is small and muted, unless it is `strong`.
  const soft = quiet && !strong;
  const ink = disabled || soft ? palette.textMuted : filled ? palette.onPrimary : palette.text;
  return (
    <Pressable
      ref={ref}
      // A screen has at most one filled button (spec 31, R31.1): tests count them.
      testID={filled ? "filled-button" : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      // aria-* rather than accessibilityState, which the web build drops.
      aria-disabled={inactive}
      aria-busy={busy ? true : undefined}
      aria-expanded={expanded}
      disabled={inactive}
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
        filled && styles.filledOuter,
        chunky(edge, edgeColor, pressed && !inactive).outer,
      ]}
    >
      {({ pressed }) => (
        <View
          testID={faceTestID}
          style={[
            quiet ? styles.quietFace : styles.face,
            { backgroundColor: tint(pressed) },
            chunky(edge, edgeColor, pressed && !inactive).face,
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={ink} />
          ) : (
            <Icon icon={icon} color={ink} size={soft ? iconSizes.inline : iconSizes.button} />
          )}
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
  // Where it stands beside its field is for the row that holds the two.
  filledOuter: { width: sizes.inputHeight, height: sizes.inputHeight, alignSelf: "auto" },
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
