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
    // A red main button's bottom edge, and its fill under the pointer (spec 31, 3.19).
    errorEdge: "#7D1812",
    errorHover: "#9A1F18",
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
    errorEdge: "#C7766C",
    errorHover: "#FFC9C2",
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

/**
 * The puffin (spec 15, sections 4.2 and 4.9), in the logo: its white face,
 * the beak's orange, the darker orange of its grooves and the eye's ring,
 * the grey plate at the beak's base, and the grey marks above and below the
 * eye. Its black is `people.face`, or `nightBlack` for a puffin drawn
 * straight on the night screen (section 5.3), so its shape stands off it;
 * the yellow at the beak's base is `people.sun`. Like the people colours,
 * only for drawings: never for text, and never the only way to show meaning.
 */
export const puffin = {
  white: "#F7F5F0",
  beak: "#F26B2E",
  beakGroove: "#D9512A",
  beakPlate: "#7C93A0",
  eyeMark: "#8E9CA3",
  nightBlack: "#2E3D45",
} as const;

/**
 * The puffins' car (spec 15, section 5.3): a round car seen from the side,
 * in the sun's yellow with darker wings over the wheels, light glass, grey
 * trim, a pale headlight and a crowberry case on the roof with darker
 * straps. The same in both modes; only its tyres lift on the night screen,
 * to `puffin.nightBlack`. Like the people colours, only for drawings.
 */
export const puffinCar = {
  body: "#F4C04E",
  wing: "#E0A93A",
  glass: "#CFE6EF",
  trim: "#C9D5DA",
  hub: "#DCE5E8",
  headlight: "#FFF6D8",
  strap: "#D9707F",
} as const;

/**
 * The Iceland scene (spec 15, section 5.3,
 * decision 15): a sky, grey mountains with white glaciers, green hills and
 * a grey road with a white line, where the puffins' car drives; at night
 * the same land in the dark. The name and the language switch stand on the
 * sky, so `text` and `primary` keep 4.5:1 on it (the tests check it). Like
 * the people colours, only for drawings.
 */
export const icelandScene = {
  light: {
    sky: "#D7E9F0",
    mountain: "#B9CBD3",
    glacier: "#FFFFFF",
    hill: "#B7DDB9",
    road: "#C6CED2",
    roadLine: "#FFFFFF",
  },
  dark: {
    sky: "#142630",
    mountain: "#24323A",
    glacier: "#3A4C55",
    hill: "#203A2D",
    road: "#3E525C",
    roadLine: "#6E7D85",
  },
} as const;

/**
 * The Iceland scene behind the front page's top in each season (spec 36,
 * 3.1 and 3.3), in the Clear day colours Martin chose: a sky that pales
 * from its top towards the land, a far range behind the mountains and
 * their glaciers, a back hill and the front hills in two greens, a
 * farmhouse's red roof, the road and its line; at night the same land
 * under a night sky. Winter's land is white and has snow on the road's
 * edge (`snow`), spring's fresh green, summer's deep green under a dusk
 * sky at night, autumn's heather and birch. Words stand on it (R36.1): on
 * a phone the name and the language link on the sky's top, so `text` and
 * `primary` keep 4.5:1 on `skyTop`; on a laptop the title on any colour of
 * the land, so `text` keeps 4.5:1 on each (the tests check it). Other
 * screens' roads and the share pictures keep `icelandScene`. Only for
 * drawings.
 */
export const icelandSeasons = {
  winter: {
    light: {
      skyTop: "#CDE4F0",
      sky: "#F1F8FB",
      far: "#D5E2EC",
      mountain: "#A6BBCD",
      glacier: "#FFFFFF",
      hillBack: "#F2F7FA",
      hill: "#DFEAF0",
      road: "#C1CAD0",
      roadLine: "#FFFFFF",
      roof: "#C8463D",
      snow: "#FFFFFF",
    },
    dark: {
      skyTop: "#091828",
      sky: "#15304A",
      far: "#1C3247",
      mountain: "#2A4358",
      glacier: "#4F6676",
      hillBack: "#34495A",
      hill: "#3F5767",
      road: "#34454E",
      roadLine: "#6E7D85",
      roof: "#A03C34",
      snow: "#587080",
    },
  },
  spring: {
    light: {
      skyTop: "#BFE3F3",
      sky: "#EBF7FA",
      far: "#C9DAE8",
      mountain: "#90ADC5",
      glacier: "#FFFFFF",
      hillBack: "#CDEBAA",
      hill: "#9CD585",
      road: "#C3CBD0",
      roadLine: "#FFFFFF",
      roof: "#C8463D",
    },
    dark: {
      skyTop: "#0D2032",
      sky: "#1C3A4D",
      far: "#1E3448",
      mountain: "#2B4457",
      glacier: "#47616F",
      hillBack: "#21442F",
      hill: "#2A5838",
      road: "#3E525C",
      roadLine: "#6E7D85",
      roof: "#A03C34",
    },
  },
  summer: {
    light: {
      skyTop: "#BDE1F3",
      sky: "#E8F6FB",
      far: "#C2D6E6",
      mountain: "#8AA8C1",
      glacier: "#FFFFFF",
      hillBack: "#A9D88F",
      hill: "#74BC6C",
      road: "#C3CBD0",
      roadLine: "#FFFFFF",
      roof: "#C8463D",
    },
    dark: {
      skyTop: "#241F42",
      sky: "#5A3C57",
      far: "#36304F",
      mountain: "#3A3757",
      glacier: "#4E4A6A",
      hillBack: "#26462F",
      hill: "#2C5536",
      road: "#3D4558",
      roadLine: "#767A90",
      roof: "#A03C34",
    },
  },
  autumn: {
    light: {
      skyTop: "#C9DFEA",
      sky: "#F5EEE3",
      far: "#CFD5DE",
      mountain: "#9DABBA",
      glacier: "#FFFFFF",
      hillBack: "#E6C07D",
      hill: "#DA9B63",
      road: "#C6C9CB",
      roadLine: "#FFFFFF",
      roof: "#C8463D",
    },
    dark: {
      skyTop: "#0B1A28",
      sky: "#1D2F3F",
      far: "#20303F",
      mountain: "#2C3D4D",
      glacier: "#4A5E6C",
      hillBack: "#4A3E28",
      hill: "#523629",
      road: "#3E4A52",
      roadLine: "#6E7D85",
      roof: "#A03C34",
    },
  },
} as const;

/**
 * What the front page's banner draws through the year (spec 36), besides
 * the people, puffin and car colours: the Icelandic flag's blue and red,
 * Yule red, a navy cap, a sky blue, chocolate, a tree's greens, a tent, a
 * sleeping bag, a guitar, a cream bun with jam, stems, lupines, heather,
 * birch, the northern lights, the low summer sun, snowflakes (their edge
 * on a light sky, their colour at night) and the stars. Only for
 * drawings.
 */
export const bannerDrawing = {
  red: "#D8423A",
  flagBlue: "#02529C",
  flagRed: "#DC1E35",
  navy: "#23395B",
  sky: "#4F95D0",
  choc: "#7A4A2E",
  chocDark: "#55311C",
  tree: "#2F7A4E",
  treeLight: "#3F9862",
  tent: "#3E8E5A",
  tentDark: "#2E6B43",
  bag: "#4F86B8",
  bagDark: "#3B6C96",
  guitar: "#C8763A",
  bun: "#DDA65E",
  cream: "#FFF8EC",
  jam: "#C8463D",
  stem: "#4E9A5A",
  lupine: "#8E6CCB",
  lupineLight: "#B9A0E6",
  heather: "#B4553F",
  birch: "#E8B34E",
  aurora: "#6FE3B4",
  aurora2: "#7FD0F0",
  sunLow: "#F6A15A",
  flakeEdge: "#9FB3BF",
  nightFlake: "#DCE7EC",
  star: "#FFFFFF",
} as const;

/** The farmhouse in the Iceland scene: its wall and windows, lit at night (spec 36, 3.1). */
export const bannerHouse = {
  light: { wall: "#F7F5F0", window: "#5B6B73" },
  dark: { wall: "#A7B4BA", window: "#F4C04E" },
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

/**
 * Google's and Apple's own colours for their sign-in buttons (spec 15,
 * section 4.2; spec 19, 3.1): the only colours on our screens that are not
 * ours, as their button rules ask. Google's light and dark buttons; Apple's
 * black button in light mode and white in dark.
 */
export const signInBrands = {
  light: {
    googleFill: "#FFFFFF",
    googleBorder: "#747775",
    googleText: "#1F1F1F",
    appleFill: "#000000",
    appleText: "#FFFFFF",
  },
  dark: {
    googleFill: "#131314",
    googleBorder: "#8E918F",
    googleText: "#E3E3E3",
    appleFill: "#FFFFFF",
    appleText: "#000000",
  },
} as const;

/** Google's "G", the same in both modes. */
export const googleLogo = {
  blue: "#4285F4",
  green: "#34A853",
  yellow: "#FBBC05",
  red: "#EA4335",
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
export const radii = { checkbox: 9, tag: 12, control: 16, card: 22, pill: 999 } as const;

/** Widths of the solid bottom edge that makes parts look chunky. */
export const edges = { card: 3, buttonPrimary: 4, buttonSecondary: 3 } as const;

/**
 * How a card stands off the page (spec 15, section 4.4): a hairline round
 * it and a soft shadow in two layers under it, tinted with the text's
 * colour by day, as CSS's `box-shadow`, which React Native draws on the
 * iPhone, on Android from version 9, and on the web. A card that is pressed
 * keeps only the near layer. At night shadows hardly show, so the hairline
 * is lighter than the page and a faint light line runs along the card's top.
 */
export const depth = {
  light: {
    ring: "rgba(31, 42, 48, 0.08)",
    shadow: "0px 1px 2px rgba(31, 42, 48, 0.06), 0px 4px 14px rgba(31, 42, 48, 0.07)",
    pressed: "0px 1px 2px rgba(31, 42, 48, 0.06)",
    highlight: null,
  },
  dark: {
    ring: "rgba(236, 242, 244, 0.09)",
    shadow: "0px 1px 2px rgba(0, 0, 0, 0.32), 0px 4px 14px rgba(0, 0, 0, 0.28)",
    pressed: "0px 1px 2px rgba(0, 0, 0, 0.32)",
    highlight: "inset 0px 1px 0px rgba(255, 255, 255, 0.05)",
  },
} as const;

export const sizes = {
  buttonHeight: 48,
  mainButtonHeight: 56,
  inputHeight: 52,
  chipHeight: 40,
  iconButton: 44,
  /** The round of a quiet icon button, drawn inside its 44 button (spec 28, 3.1). */
  iconButtonSmall: 36,
  /** A story picture's width in Share this ride; it stands 16 by 9 (spec 28, 3.2). */
  storyPreview: 108,
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
  /** Narrowest the words of a line get before the button or link beside them moves under them. */
  wordsBeside: 144,
  /** Widest the car from above gets beside the words about its seats (spec 31, 3.7). */
  carBeside: 176,
  /** Narrowest it gets there, before the words move under it: the two fit a 360 wide phone. */
  carBesideLeast: 120,
  /** The small map beside the place where to stand (spec 31, 3.8). */
  mapBeside: 104,
  /** A row that opens a screen, such as My cars on Profile. */
  row: 56,
  /** The soft square behind a row's icon, and behind the icon of what needs you (spec 31, 3.3). */
  rowIcon: 36,
  /**
   * The road that shows where things stand (spec 31, 3.3): the car on it,
   * how high its lane is, and the round mark of a step.
   */
  roadCar: 60,
  road: 12,
  roadMark: 10,
  /** The notch a ride ticket's tear line cuts into each edge (spec 31, 3.3). */
  ticketNotch: 16,
  /** A small picture of a person, as in a ride ticket's foot (spec 31, 3.3). */
  avatarSmall: 28,
  /** The square of one seat in the driver's line about the seats (spec 31, 3.12). */
  seat: 28,
  /** A place of the menu's tab bar, and the pill behind its icon when chosen. */
  tab: 56,
  tabPill: 56,
  /** The logo beside the name in the top bar on wide screens. */
  logoSmall: 36,
  /** The height, and narrowest width, of the unread count on Messages in the menu. */
  badge: 20,
  /**
   * The App Store's and Google Play's badges on the website (spec 35, 3.8):
   * Apple's least height on a screen. A quarter of it is their clear space.
   */
  storeBadge: 40,
  /** The QR code to get the app, on About on a laptop (spec 35, 3.6). */
  qrCode: 120,
  /** The picture of the screen on Send feedback: small, in a phone's shape. */
  screenshotWidth: 144,
  screenshotHeight: 312,
  /**
   * The puffin scenes (spec 15, section 5.3): the car on a phone's front page,
   * on a wide page's title line (no higher than the title and the room
   * around it), and driving off when a seat is booked; the puffin by a pin
   * on an empty screen, and small beside the line that ends a list, by its
   * height.
   */
  sceneCar: 170,
  sceneCarSmall: 88,
  sceneCarBooked: 200,
  /**
   * The Iceland scene (spec 15, section 5.3): its road on a phone; on a
   * wide page the line of the title over it, which holds the title with
   * its line at the left and the car on its hills at the right (spec 31,
   * 3.16).
   */
  sceneRoad: 22,
  sceneLine: 132,
  sceneCarWide: 170,
  scenePuffin: 120,
  scenePuffinSmall: 60,
} as const;

/** Width of the outline on inputs, tick boxes and chips. */
export const controlOutline = 2;

/** Width of the hairline round a card (`depth`). */
export const hairline = 1;

/** Smallest touch target, in points (WCAG 2.2 AA, conventions). */
export const minTouchTarget = 44;

/** Content column width on wide screens (spec 1, section 5). */
export const maxContentWidth = 480;

/**
 * From this width a screen is wide: a page with columns or a grid, or a map
 * beside a list (spec 15, section 4.8; spec 18, 3.2).
 */
export const sidePanelFrom = 900;
/**
 * Under this height a window is short, as a phone on its side or a laptop
 * zoomed far in: a screen's bottom bar joins the end of its page, which
 * keeps the height (spec 31, 3.20).
 */
export const shortWindowUnder = 480;
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
/**
 * What the top of a conversation leaves of the height the conversation has
 * (a phone's screen, a laptop's pane) for the messages, the quick messages
 * and the bar, at the least, while it stays. A top that leaves less scrolls
 * with the conversation (spec 31, 3.13).
 */
export const roomUnderTop = 400;

/** Stroke width of Lucide icons. */
export const iconStroke = 2.4;

/** Icon sizes: in buttons and notices, beside small text, in ticks (spec 15, section 4.5). */
export const iconSizes = { button: 22, inline: 18, tick: 16 } as const;

/** The keyboard focus ring: 3 wide, 2 away from the part. */
export const focusRing = { width: 3, offset: 2 } as const;

/**
 * Motion (spec 33, section 6): how long things take, in milliseconds, and
 * their curves. `out` for what arrives, `inOut` for what moves from one
 * place on the screen to another, `brake` for the car slowing to a stop,
 * `rise` and `fall` for a hop: up quickly, then down as things fall. None
 * starts slowly on its own (no ease-in): that delays the moment people
 * look at; `fall` comes only after `rise`.
 *
 * The car's arrival on the front page: it drives in, its body bobs twice
 * on the road (`bumps`, points up) and dips its nose as it stops (`dip`,
 * degrees down, then back past level), within `settle`; then the passenger
 * and the driver hop `hopHeight` points, each for `hop`, all within
 * `celebrate`.
 */
export const motion = {
  quick: 120,
  pop: 150,
  open: 180,
  appear: 300,
  step: 400,
  celebrate: 1900,
  arrival: {
    drive: 1100,
    settle: 1500,
    hop: 300,
    hops: [1400, 1540],
    bumps: [1.6, 1.3],
    dip: [2.6, -0.8],
    hopHeight: 5,
  },
  /**
   * The front page's moments (spec 36, 3.6): each season's and day's own
   * motion, from the preview. It starts with the car's arrival, plays
   * once, and is over within `limit`, in milliseconds. A pair is the
   * earliest and the latest for what each drawn thing is given (`--d`,
   * `--t`); `at` is when each burst of the fireworks comes; `times` is
   * how often a short motion repeats within its part's.
   */
  moments: {
    limit: 3500,
    flake: { duration: [1700, 2600], delay: [0, 900] },
    leaf: { duration: [1500, 2200], delay: [150, 1150] },
    flyer: { duration: [2500, 2700], delay: [200, 520] },
    "flyer-bob": { duration: 400, delay: [200, 520], times: 6 },
    "flyer-wing": { duration: 120, delay: [200, 520], times: 22 },
    aurora: { duration: 3000 },
    sunrise: { duration: 1900, delay: 150 },
    rays: { duration: 2600 },
    glow: { duration: 2000 },
    burst: { duration: 1300, at: [300, 850, 1400] },
    // Each trail rises in the time before its burst, and is gone as it bursts.
    trail: { duration: 420, at: [300, 850, 1400] },
    // The tree's lights, one after another from the car's stop.
    bulb: { duration: 520, delay: [1450, 2305] },
    chick: { duration: 2400 },
    cloth: { duration: 1700, delay: 500 },
    balloons: { duration: 2300 },
    load: { duration: 1500 },
    heart: { duration: 2300 },
    sparkle: { duration: 2200 },
    flower: { duration: 450, delay: [300, 1500] },
    lupine: { duration: 1900, delay: [100, 1500] },
    cover: { duration: 3200 },
  },
  curves: {
    out: "cubic-bezier(0.23, 1, 0.32, 1)",
    inOut: "cubic-bezier(0.77, 0, 0.175, 1)",
    brake: "cubic-bezier(0.33, 1, 0.68, 1)",
    rise: "cubic-bezier(0.25, 0.6, 0.4, 1)",
    fall: "cubic-bezier(0.5, 0, 0.75, 0)",
  },
} as const;
