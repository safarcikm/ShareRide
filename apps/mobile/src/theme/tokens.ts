import { Platform } from "react-native";

/**
 * Design tokens from spec 15, the visual design system
 * (docs/specs/2026-11-13-visual-design-system.md). Screens and components use
 * these, never raw colours or sizes. A unit test checks every colour pair the
 * spec promises against WCAG 2.2 AA.
 */
export const colors = {
  light: {
    background: "#EEF3F4",
    surface: "#FFFFFF",
    text: "#1F2A30",
    textMuted: "#56636B",
    primary: "#2F6B4F",
    onPrimary: "#FFFFFF",
    primaryEdge: "#1F4A36",
    primarySoft: "#E2EFE7",
    border: "#DCE5E8",
    control: "#7F8C93",
    edge: "#D2DDE1",
    focus: "#1F5F8B",
    error: "#B3261E",
    onError: "#FFFFFF",
    errorSoft: "#FCE8E6",
    infoSoft: "#E1EDF6",
  },
  dark: {
    background: "#121A1E",
    surface: "#1B252B",
    text: "#ECF2F4",
    textMuted: "#A6B4BB",
    primary: "#7CC49E",
    onPrimary: "#0C2117",
    primaryEdge: "#4E8E6C",
    primarySoft: "#203A2D",
    border: "#2C3940",
    control: "#6E7D85",
    edge: "#0B1013",
    focus: "#8FCBE6",
    error: "#FFB4AB",
    onError: "#3B0905",
    errorSoft: "#3B1A17",
    infoSoft: "#16303F",
  },
} as const;

export type ColorScheme = keyof typeof colors;
export type Palette = { readonly [K in keyof (typeof colors)["light"]]: string };

/**
 * Font faces, loaded at start (theme/fonts.ts). The face sets the weight:
 * never set fontWeight, because Android ignores it for custom fonts.
 */
export const fonts = {
  display: "Fredoka_600SemiBold",
  displayMedium: "Fredoka_500Medium",
  body: "Nunito_400Regular",
  bodySemiBold: "Nunito_600SemiBold",
  bodyBold: "Nunito_700Bold",
} as const;

/**
 * A font face as a font family. On the web a system font stands in if the
 * face fails to load; phones fall back to the system font by themselves.
 */
export function fontFamily(face: string, os: string = Platform.OS): string {
  return os === "web" ? `${face}, system-ui, sans-serif` : face;
}

export const typography = {
  display: { fontFamily: fontFamily(fonts.display), fontSize: 48, lineHeight: 52 },
  title: { fontFamily: fontFamily(fonts.display), fontSize: 28, lineHeight: 34 },
  heading: { fontFamily: fontFamily(fonts.display), fontSize: 19, lineHeight: 24 },
  figure: { fontFamily: fontFamily(fonts.display), fontSize: 22, lineHeight: 28 },
  figureSmall: { fontFamily: fontFamily(fonts.displayMedium), fontSize: 16, lineHeight: 22 },
  button: { fontFamily: fontFamily(fonts.display), fontSize: 18, lineHeight: 22 },
  body: { fontFamily: fontFamily(fonts.body), fontSize: 17, lineHeight: 24 },
  bodyStrong: { fontFamily: fontFamily(fonts.bodyBold), fontSize: 17, lineHeight: 24 },
  label: { fontFamily: fontFamily(fonts.bodyBold), fontSize: 15, lineHeight: 20 },
  small: { fontFamily: fontFamily(fonts.body), fontSize: 15, lineHeight: 20 },
  caption: { fontFamily: fontFamily(fonts.bodyBold), fontSize: 13, lineHeight: 18 },
} as const;

export const spacing = { xs: 4, sm: 8, ms: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

/** Corner radii. */
export const radii = { seat: 4, checkbox: 9, tag: 12, control: 16, card: 22, pill: 999 } as const;

/** Widths of the solid bottom edge that makes parts look chunky. */
export const edges = { card: 3, buttonPrimary: 4, buttonSecondary: 3 } as const;

export const sizes = {
  buttonHeight: 48,
  mainButtonHeight: 56,
  inputHeight: 52,
  chipHeight: 40,
  iconButton: 44,
  checkbox: 26,
} as const;

/** Width of the outline on inputs, tick boxes and chips. */
export const controlOutline = 2;

/** Smallest touch target, in points (WCAG 2.2 AA, conventions). */
export const minTouchTarget = 44;

/** Content column width on wide screens (spec 1, section 5). */
export const maxContentWidth = 480;

/** Stroke width of Lucide icons. */
export const iconStroke = 2.4;

/** Icon sizes: in buttons and notices, beside small text, in ticks (spec 15, section 4.5). */
export const iconSizes = { button: 22, inline: 18, tick: 16 } as const;

/** The keyboard focus ring: 3 wide, 2 away from the part. */
export const focusRing = { width: 3, offset: 2 } as const;
