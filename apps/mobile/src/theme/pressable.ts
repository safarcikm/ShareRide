import type { ViewStyle } from "react-native";
import { focusRing, type Palette } from "./tokens";

/**
 * The solid bottom edge that makes a part look chunky (spec 15, section
 * 4.4). The outer view carries the edge; the face sits on it. When pressed,
 * the face moves down over the edge, so the part sinks without changing its
 * height and nothing around it moves.
 */
export function chunky(
  edge: number,
  edgeColor: string,
  pressed: boolean,
): { readonly outer: ViewStyle; readonly face: ViewStyle } {
  return {
    outer: { borderBottomWidth: edge, borderBottomColor: edgeColor },
    face: pressed ? { transform: [{ translateY: edge }] } : {},
  };
}

/**
 * The keyboard focus ring on the web, as a style sheet: `:focus-visible`
 * shows it for the keyboard and not for taps or clicks. Text fields show
 * focus with their own moss outline instead (TextField). Phones keep their
 * own focus highlight (spec 15, section 6).
 */
export function focusRingCss(light: Palette, dark: Palette): string {
  const parts = ":focus-visible:not(input):not(textarea)";
  const ring = `${String(focusRing.width)}px solid`;
  return (
    `${parts}{outline:${ring} ${light.focus} !important;` +
    `outline-offset:${String(focusRing.offset)}px !important}` +
    "input:focus,textarea:focus{outline:none !important}" +
    `@media (prefers-color-scheme: dark){${parts}{outline-color:${dark.focus} !important}}`
  );
}
