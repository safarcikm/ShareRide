import {
  colors,
  controlOutline,
  depth,
  edges,
  focusRing,
  hairline,
  mapDrawing,
  maxContentWidth,
  asideMaxWidth,
  minTouchTarget,
  radii,
  sidePanelWidth,
  spacing,
  typeScale,
  type Palette,
} from "@shareride/ui";

const kebab = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** "Fredoka_600SemiBold" is the family Fredoka at weight 600. */
export function faceParts(face: string): { family: string; weight: number } {
  const match = /^([A-Za-z]+)_(\d{3})/.exec(face);
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error(`Not a font face name: ${face}`);
  }
  return { family: match[1], weight: Number(match[2]) };
}

/**
 * A card's hairline and soft shadow (spec 15, section 4.4), as the app draws
 * them, with the light line along its top at night.
 */
export function cardLift(lift: (typeof depth)["light" | "dark"]): string {
  return [lift.highlight, `0 0 0 ${String(hairline)}px ${lift.ring}`, lift.shadow]
    .filter((layer) => layer !== null)
    .join(", ");
}

const palette = (
  scheme: Palette,
  map: (typeof mapDrawing)["light" | "dark"],
  lift: (typeof depth)["light" | "dark"],
) => [
  ...Object.entries(scheme).map(([name, value]) => `  --color-${kebab(name)}: ${value};`),
  ...Object.entries(map).map(([name, value]) => `  --map-${kebab(name)}: ${value};`),
  `  --card-lift: ${cardLift(lift)};`,
];

/**
 * The shared design tokens (spec 15) as CSS variables, light and dark, with
 * the map's colours (ADR 0024), and one class per type style. The console's own CSS uses only these.
 */
export function tokenStylesheet(): string {
  const sizes = [
    ...Object.entries(spacing).map(([name, value]) => `  --space-${name}: ${value}px;`),
    ...Object.entries(radii).map(([name, value]) => `  --radius-${kebab(name)}: ${value}px;`),
    ...Object.entries(edges).map(([name, value]) => `  --edge-${kebab(name)}: ${value}px;`),
    `  --touch-target: ${minTouchTarget}px;`,
    `  --narrow-width: ${maxContentWidth}px;`,
    `  --control-outline: ${controlOutline}px;`,
    `  --menu-width: ${sidePanelWidth}px;`,
    `  --aside-width: ${asideMaxWidth}px;`,
    `  --focus-width: ${focusRing.width}px;`,
    `  --focus-offset: ${focusRing.offset}px;`,
  ];
  const types = Object.entries(typeScale).map(([name, style]) => {
    const { family, weight } = faceParts(style.face);
    return [
      `.type-${kebab(name)} {`,
      `  font-family: ${family}, system-ui, sans-serif;`,
      `  font-weight: ${weight};`,
      `  font-size: ${style.fontSize}px;`,
      `  line-height: ${style.lineHeight}px;`,
      `}`,
    ].join("\n");
  });
  return [
    ":root {",
    "  color-scheme: light dark;",
    ...palette(colors.light, mapDrawing.light, depth.light),
    ...sizes,
    "}",
    "@media (prefers-color-scheme: dark) {",
    "  :root {",
    ...palette(colors.dark, mapDrawing.dark, depth.dark).map((line) => `  ${line}`),
    "  }",
    "}",
    ...types,
    "",
  ].join("\n");
}
