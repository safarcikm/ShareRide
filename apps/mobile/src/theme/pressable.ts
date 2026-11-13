import { Platform, type ViewStyle } from "react-native";
import { focusRing, type Palette } from "./tokens";

/**
 * The solid bottom edge that makes a part look chunky (spec 15, section 4.4).
 * When pressed, the part moves down by its edge and the edge turns
 * transparent: the box keeps its height, so nothing around it moves.
 */
export function edgeStyle(edge: number, edgeColor: string, pressed: boolean): ViewStyle {
  return pressed
    ? {
        borderBottomWidth: edge,
        borderBottomColor: "transparent",
        transform: [{ translateY: edge }],
      }
    : { borderBottomWidth: edge, borderBottomColor: edgeColor };
}

/**
 * The keyboard focus ring on the web. Phones keep their own focus highlight
 * (spec 15, section 6).
 */
export function focusStyle(
  focused: boolean,
  palette: Palette,
  platform: typeof Platform.OS = Platform.OS,
): ViewStyle {
  if (!focused || platform !== "web") return {};
  return {
    outlineColor: palette.focus,
    outlineWidth: focusRing.width,
    outlineOffset: focusRing.offset,
    outlineStyle: "solid",
  };
}
