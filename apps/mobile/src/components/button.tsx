import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useHover } from "@/theme/hover";
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
import { linkProps, type AppPath } from "@/navigation/link-props";

/**
 * `danger` is the filled button of what cannot be undone, such as
 * "Cancel booking" on the screen that asks first (spec 31, 3.19): red where
 * `primary` is moss, and a screen's one filled button as that is (R31.1).
 */
type Variant = "primary" | "danger" | "secondary" | "text";

type ButtonProps = ButtonLook &
  (
    | { readonly onPress: () => void; readonly href?: never }
    | {
        /**
         * Opens this screen: a link, an `<a href>` on the web that search
         * engines follow (spec 23, 3.6), that looks like the button.
         */
        readonly href: AppPath;
        readonly onPress?: never;
      }
  );

interface ButtonLook {
  readonly label: string;
  /** Read by screen readers instead of the label, when the label is not enough. */
  readonly accessibilityLabel?: string;
  readonly variant?: Variant;
  /** Waiting for the API: shows a spinner before the label and ignores presses. */
  readonly busy?: boolean;
  readonly disabled?: boolean;
  /** The screen's main action, such as a step's "Continue": full width and 56 high. */
  readonly main?: boolean;
  /** As wide as the room it is given, such as one of two equal choices side by side. */
  readonly fill?: boolean;
  /** For a button that opens and closes something below it: whether it is open. */
  readonly expanded?: boolean;
}

/**
 * Colours and edge of each variant (spec 15, section 5.1), and how each
 * shows that the pointer is over it (spec 18, 3.4).
 */
function look(variant: Variant, palette: Palette, disabled: boolean, hovered: boolean) {
  if (disabled) {
    return {
      face: { backgroundColor: palette.border },
      label: palette.textMuted,
      underlined: false,
      edge: 0,
      edgeColor: "transparent",
    };
  }
  switch (variant) {
    case "primary":
      return {
        face: { backgroundColor: hovered ? palette.primaryHover : palette.primary },
        label: palette.onPrimary,
        underlined: false,
        edge: edges.buttonPrimary,
        edgeColor: palette.primaryEdge,
      };
    case "danger":
      return {
        face: { backgroundColor: hovered ? palette.errorHover : palette.error },
        label: palette.onError,
        underlined: false,
        edge: edges.buttonPrimary,
        edgeColor: palette.errorEdge,
      };
    case "secondary":
      return {
        face: {
          backgroundColor: hovered ? palette.primarySoft : palette.surface,
          borderWidth: 2,
          borderColor: palette.control,
        },
        label: palette.text,
        underlined: false,
        edge: edges.buttonSecondary,
        edgeColor: palette.edge,
      };
    case "text":
      return {
        face: {},
        label: palette.primary,
        underlined: hovered,
        edge: 0,
        edgeColor: "transparent",
      };
  }
}

export function Button({
  label,
  onPress,
  href,
  accessibilityLabel,
  variant = "primary",
  busy = false,
  disabled = false,
  main = false,
  fill = false,
  expanded,
}: ButtonProps) {
  const palette = usePalette();
  const inactive = busy || disabled;
  const [hovered, hover] = useHover(inactive);
  const {
    face,
    label: labelColor,
    underlined,
    edge,
    edgeColor,
  } = look(variant, palette, disabled, hovered);
  return (
    <Pressable
      // A screen has at most one filled button (spec 31, R31.1): tests count them.
      testID={variant === "primary" || variant === "danger" ? "filled-button" : undefined}
      accessibilityRole={href === undefined ? "button" : "link"}
      accessibilityLabel={accessibilityLabel ?? label}
      // aria-* rather than accessibilityState, which the web build drops.
      aria-disabled={inactive}
      aria-busy={busy}
      aria-expanded={expanded}
      disabled={inactive}
      {...(href === undefined ? { onPress } : linkProps(href))}
      {...hover}
      style={({ pressed }) => [
        styles.outer,
        variant === "text" && styles.textOuter,
        main && styles.mainOuter,
        fill && styles.fillOuter,
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
              underlined && styles.underlined,
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
  fillOuter: { alignSelf: "stretch" },
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
  underlined: { textDecorationLine: "underline" },
});
