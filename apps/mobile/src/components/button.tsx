import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { chunky } from "@/theme/pressable";
import {
  edges,
  minTouchTarget,
  radii,
  sizes,
  spacing,
  typography,
  type Palette,
} from "@/theme/tokens";
import { usePalette } from "@/theme/use-palette";

type Variant = "primary" | "secondary" | "text";

interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  /** Read by screen readers instead of the label, when the label is not enough. */
  readonly accessibilityLabel?: string;
  readonly variant?: Variant;
  /** Waiting for the API: shows a spinner before the label and ignores presses. */
  readonly busy?: boolean;
  readonly disabled?: boolean;
  /** The screen's main action, such as a step's "Continue": full width and 56 high. */
  readonly main?: boolean;
  /** For a button that opens and closes something below it: whether it is open. */
  readonly expanded?: boolean;
}

/** Colours and edge of each variant (spec 15, section 5.1). */
function look(variant: Variant, palette: Palette, disabled: boolean) {
  if (disabled) {
    return {
      face: { backgroundColor: palette.border },
      label: palette.textMuted,
      edge: 0,
      edgeColor: "transparent",
    };
  }
  switch (variant) {
    case "primary":
      return {
        face: { backgroundColor: palette.primary },
        label: palette.onPrimary,
        edge: edges.buttonPrimary,
        edgeColor: palette.primaryEdge,
      };
    case "secondary":
      return {
        face: { backgroundColor: palette.surface, borderWidth: 2, borderColor: palette.control },
        label: palette.text,
        edge: edges.buttonSecondary,
        edgeColor: palette.edge,
      };
    case "text":
      return { face: {}, label: palette.primary, edge: 0, edgeColor: "transparent" };
  }
}

export function Button({
  label,
  onPress,
  accessibilityLabel,
  variant = "primary",
  busy = false,
  disabled = false,
  main = false,
  expanded,
}: ButtonProps) {
  const palette = usePalette();
  const inactive = busy || disabled;
  const { face, label: labelColor, edge, edgeColor } = look(variant, palette, disabled);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      // aria-* rather than accessibilityState, which the web build drops.
      aria-disabled={inactive}
      aria-busy={busy}
      aria-expanded={expanded}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.outer,
        variant === "text" && styles.textOuter,
        main && styles.mainOuter,
        chunky(edge, edgeColor, pressed && !inactive).outer,
      ]}
    >
      {({ pressed }) => (
        <View
          testID="button-face"
          style={[
            styles.face,
            variant === "text" && styles.textFace,
            face,
            chunky(edge, edgeColor, pressed && !inactive).face,
          ]}
        >
          {busy ? <ActivityIndicator size="small" color={labelColor} /> : null}
          <Text
            style={[
              variant === "text" ? typography.label : typography.button,
              styles.label,
              { color: labelColor },
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // A button fits its label and sits in the middle of the column (spec 15,
  // section 5.1); a row around it can place it elsewhere.
  outer: {
    minHeight: sizes.buttonHeight,
    minWidth: minTouchTarget,
    borderRadius: radii.control,
    alignSelf: "center",
  },
  textOuter: { minHeight: minTouchTarget },
  mainOuter: { minHeight: sizes.mainButtonHeight, alignSelf: "stretch" },
  face: {
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.control,
  },
  textFace: { paddingHorizontal: spacing.sm },
  label: { flexShrink: 1, textAlign: "center" },
});
