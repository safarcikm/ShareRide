/**
 * Design tokens from spec 15, the visual design system
 * (docs/specs/2026-11-13-visual-design-system.md), shared by the app and the
 * operator console (ADR 0017). Screens and components use these, never raw
 * colours or sizes. A unit test checks every colour pair the spec promises
 * against WCAG 2.2 AA.
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
    // A primary button under the pointer (spec 18, 3.4).
    primaryHover: "#285C44",
    primarySoft: "#E2EFE7",
    border: "#DCE5E8",
    control: "#7F8C93",
    edge: "#D2DDE1",
    focus: "#1F5F8B",
    error: "#B3261E",
    onError: "#FFFFFF",
    errorSoft: "#FCE8E6",
    infoSoft: "#E1EDF6",
    // Tag text on its tinted fill (spec 15, section 4.1). Info tags use infoSoft.
    warning: "#8A4B00",
    warningSoft: "#FFF3DC",
    info: "#1F5F8B",
    womenOnly: "#6B3FA0",
    womenOnlySoft: "#F1EAFB",
    // A rating's stars (spec 15, section 4.1), always next to the number.
    rating: "#B97F0F",
  },
  dark: {
    background: "#121A1E",
    surface: "#1B252B",
    text: "#ECF2F4",
    textMuted: "#A6B4BB",
    primary: "#7CC49E",
    onPrimary: "#0C2117",
    primaryEdge: "#4E8E6C",
    primaryHover: "#8FD0AC",
    primarySoft: "#203A2D",
    border: "#2C3940",
    control: "#6E7D85",
    edge: "#0B1013",
    focus: "#8FCBE6",
    error: "#FFB4AB",
    onError: "#3B0905",
    errorSoft: "#3B1A17",
    infoSoft: "#16303F",
    warning: "#F2C46B",
    warningSoft: "#2E2614",
    info: "#8FCBE6",
    womenOnly: "#CDB6F2",
    womenOnlySoft: "#2E2340",
    rating: "#E9B44C",
  },
} as const;

/**
 * People and illustration colours (spec 15, section 4.2): only for shape
 * people, need icons and drawings, never for text and never the only way to
 * show meaning. The same in both modes; faces are drawn in `face`.
 */
export const people = {
  glacier: "#8FCBE6",
  crowberry: "#F08C9C",
  lupine: "#A99BEB",
  mossLight: "#9ED0A0",
  sun: "#F4C04E",
  wool: "#EADFCB",
  face: "#1F2A30",
} as const;

/** The five people colours a driver's shape person and initial can have, in a fixed order. */
export const peopleColours = [
  people.glacier,
  people.crowberry,
  people.lupine,
  people.mossLight,
  people.sun,
] as const;

/**
 * The car seen from above (spec 15, sections 4.2 and 5.3): body, glass and
 * cabin; seats and the shapes of passengers who took a seat.
 */
export const carDrawing = {
  light: {
    body: "#D5E1E5",
    glass: "#A9C4CE",
    cabin: "#F5F8F9",
    seat: "#C9D5DA",
    taken: "#8E9CA3",
    steering: "#5B6B73",
    wheel: "#1F2A30",
  },
  dark: {
    body: "#34454E",
    glass: "#557784",
    cabin: "#24323A",
    seat: "#3E525C",
    taken: "#7F8C93",
    steering: "#9AA8AE",
    wheel: "#0B1013",
  },
} as const;

/**
 * Our own map of Iceland (ADR 0024; spec 15, section 4.2): sea, land and its
 * coast, glaciers, main roads and the Ring Road. Routes and dots use the
 * palette's `primary`, `control` and `surface`.
 */
export const mapDrawing = {
  light: {
    sea: "#D7E9F0",
    land: "#F4F1EA",
    coast: "#B9CBD3",
    glacier: "#FFFFFF",
    road: "#C6CED2",
    ringRoad: "#9AA9B0",
  },
  dark: {
    sea: "#142630",
    land: "#24323A",
    coast: "#3E525C",
    glacier: "#3A4C55",
    road: "#3E525C",
    ringRoad: "#6E7D85",
  },
} as const;

export type ColorScheme = keyof typeof colors;
export type Palette = { readonly [K in keyof (typeof colors)["light"]]: string };

/**
 * Font faces, which the app loads at start (its theme/fonts.ts). The face sets the weight:
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
 * The type scale (spec 15, section 5): each style's font face, size and line
 * height in pixels. The face sets the weight; each client turns the face into
 * its own font family.
 */
export const typeScale = {
  display: { face: fonts.display, fontSize: 48, lineHeight: 52 },
  title: { face: fonts.display, fontSize: 28, lineHeight: 34 },
  heading: { face: fonts.display, fontSize: 19, lineHeight: 24 },
  figure: { face: fonts.display, fontSize: 22, lineHeight: 28 },
  figureSmall: { face: fonts.displayMedium, fontSize: 16, lineHeight: 22 },
  button: { face: fonts.display, fontSize: 18, lineHeight: 22 },
  body: { face: fonts.body, fontSize: 17, lineHeight: 24 },
  bodyStrong: { face: fonts.bodyBold, fontSize: 17, lineHeight: 24 },
  label: { face: fonts.bodyBold, fontSize: 15, lineHeight: 20 },
  small: { face: fonts.body, fontSize: 15, lineHeight: 20 },
  caption: { face: fonts.bodyBold, fontSize: 13, lineHeight: 18 },
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
  /** The round mark of a radio card. */
  radio: 24,
  switchWidth: 52,
  switchHeight: 32,
  switchThumb: 22,
  /** The bars of StepProgress and the price level's track. */
  bar: 8,
  /** The price level's handle and the dots that mark its steps. */
  priceHandle: 36,
  priceDot: 4,
  /** Room for a word under a point of the price level's track. */
  priceLabel: 96,
  /** A day in the calendar: the smallest touch target. */
  calendarDay: 44,
  /** A row of the time wheel, the rows it shows at once, and the width of one wheel. */
  wheelRow: 44,
  wheelRows: 5,
  wheelWidth: 64,
  /** Narrowest the main action of a bottom bar gets before it moves under the price. */
  barAction: 200,
  /** A row that opens a screen, such as My cars on Profile. */
  row: 56,
  /** A place of the menu's tab bar, and the pill behind its icon when chosen. */
  tab: 56,
  tabPill: 56,
  /** The logo beside the name in the top bar on wide screens. */
  logoSmall: 36,
  /** The height, and narrowest width, of the unread count on Messages in the menu. */
  badge: 20,
  /** The picture of the screen on Send feedback: small, in a phone's shape. */
  screenshotWidth: 144,
  screenshotHeight: 312,
} as const;

/** Width of the outline on inputs, tick boxes and chips. */
export const controlOutline = 2;

/** Smallest touch target, in points (WCAG 2.2 AA, conventions). */
export const minTouchTarget = 44;

/** Content column width on wide screens (spec 1, section 5). */
export const maxContentWidth = 480;

/**
 * From this width a screen is wide: a page with columns or a grid, or a map
 * beside a list (spec 15, section 4.8; spec 18, 3.2).
 */
export const sidePanelFrom = 900;
/** The menu at the side of the operator console. */
export const sidePanelWidth = 320;
/** From the same width, a map sits beside a list, at most this wide (spec 15, section 4.8). */
export const asideMaxWidth = 640;
/**
 * A page on wide screens: the column, a gap and the map beside it, as on
 * meeting points. Two columns and grids fill it (spec 18, 3.2).
 */
export const pageMaxWidth = maxContentWidth + spacing.lg + asideMaxWidth;
/** The side column of a screen with two columns (spec 18, 3.2). */
export const sideColumnWidth = 400;
/** Narrowest a card gets in a grid before the grid drops a column (spec 18, 3.2). */
export const gridCardMinWidth = 320;
/** Narrowest a half of a card gets before the two go one under the other (spec 18, 3.2). */
export const halfMinWidth = 280;
/** The list of conversations beside the open one (spec 18, 3.11). */
export const listPaneWidth = 360;

/** Stroke width of Lucide icons. */
export const iconStroke = 2.4;

/** Icon sizes: in buttons and notices, beside small text, in ticks (spec 15, section 4.5). */
export const iconSizes = { button: 22, inline: 18, tick: 16 } as const;

/** The keyboard focus ring: 3 wide, 2 away from the part. */
export const focusRing = { width: 3, offset: 2 } as const;
