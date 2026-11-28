import { Platform, type ViewStyle } from "react-native";
import { controlOutline, depth, focusRing, type ColorScheme, type Palette } from "./tokens";

/** The styles of a part's two views: the outer one takes the room, the face draws it. */
export interface Lift {
  readonly outer: ViewStyle;
  readonly face: ViewStyle;
}

/**
 * Android before 9, where React Native draws no box shadows: there a part
 * keeps a solid bottom border for its edge, and a card the system's own
 * shadow.
 */
export function drawsBoxShadows(os: string = Platform.OS, version: unknown = Platform.Version) {
  return !(os === "android" && typeof version === "number" && version < 28);
}

/**
 * The solid edge that makes a part you press look chunky (spec 15, section
 * 4.4): a second face in `edgeColor`, `edge` lower than the face and as
 * wide, drawn as a hard shadow, so the edge is as thick at the corners as
 * in the middle. The outer view keeps the room for it; when pressed, the
 * face moves down over it, so the part sinks without changing its height
 * and nothing around it moves.
 */
export function chunky(
  edge: number,
  edgeColor: string,
  pressed: boolean,
  boxShadows: boolean = drawsBoxShadows(),
): Lift {
  if (edge === 0) return { outer: {}, face: {} };
  const sunk = { transform: [{ translateY: edge }] };
  if (!boxShadows) {
    return {
      outer: { borderBottomWidth: edge, borderBottomColor: edgeColor },
      face: pressed ? sunk : {},
    };
  }
  return {
    outer: { paddingBottom: edge },
    face: pressed ? sunk : { boxShadow: `0px ${String(edge)}px 0px ${edgeColor}` },
  };
}

/** How far a card sinks when pressed. */
export const cardSink = 1;

/**
 * How a card stands off the page (spec 15, section 4.4): a hairline round
 * its face and a soft shadow under it (`depth`), and at night a faint light
 * line along its top. A `ring` in a colour of its own, such as `primary`
 * under the pointer, is twice as thick. When pressed, the face sinks a
 * little and keeps only the near shadow.
 */
export function cardLift(
  scheme: ColorScheme,
  { pressed = false, ring }: { readonly pressed?: boolean; readonly ring?: string } = {},
  boxShadows: boolean = drawsBoxShadows(),
): Lift {
  const sunk = pressed ? { transform: [{ translateY: cardSink }] } : {};
  if (!boxShadows) {
    const outline = ring === undefined ? {} : { borderWidth: controlOutline, borderColor: ring };
    return { outer: {}, face: { elevation: pressed ? 1 : 2, ...outline, ...sunk } };
  }
  const tokens = depth[scheme];
  const outline = `0px 0px 0px ${String(ring === undefined ? 1 : controlOutline)}px ${ring ?? tokens.ring}`;
  const layers = [tokens.highlight, outline, pressed ? tokens.pressed : tokens.shadow];
  return {
    outer: {},
    face: { boxShadow: layers.filter((layer) => layer !== null).join(", "), ...sunk },
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
    `[data-ring="inside"]${parts}{outline-offset:${String(-focusRing.width)}px !important}` +
    "input:focus,textarea:focus{outline:none !important}" +
    `@media (prefers-color-scheme: dark){${parts}{outline-color:${dark.focus} !important}}`
  );
}
