/**
 * Design tokens. A neutral starting point until the brand direction is set
 * (roadmap, Phase 1). Colour pairs meet WCAG 2.2 AA contrast (4.5:1 for text).
 */
export const colors = {
  light: {
    background: "#FFFFFF",
    surface: "#F3F5F7",
    text: "#14181F",
    textMuted: "#4A5361",
    primary: "#0B5CAD",
    onPrimary: "#FFFFFF",
    border: "#C9D0D9",
    focus: "#F2A900",
  },
  dark: {
    background: "#0F1216",
    surface: "#1A1F26",
    text: "#F1F3F5",
    textMuted: "#B4BCC7",
    primary: "#7FB6F2",
    onPrimary: "#0A1A2B",
    border: "#38414D",
    focus: "#F2A900",
  },
} as const;

export type ColorScheme = keyof typeof colors;
export type Palette = { readonly [K in keyof (typeof colors)["light"]]: string };

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const typography = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  body: { fontSize: 17, lineHeight: 24, fontWeight: "400" },
  button: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
} as const;

/** Smallest touch target, in points (WCAG 2.2 AA, conventions). */
export const minTouchTarget = 44;

/** Content column width on wide screens (spec 1, section 5). */
export const maxContentWidth = 480;
