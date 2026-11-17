import {
  colors,
  controlOutline,
  edges,
  focusRing,
  maxContentWidth,
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

const palette = (scheme: Palette) =>
  Object.entries(scheme).map(([name, value]) => `  --color-${kebab(name)}: ${value};`);

/**
 * The shared design tokens (spec 15) as CSS variables, light and dark, and
 * one class per type style. The console's own CSS uses only these.
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
    ...palette(colors.light),
    ...sizes,
    "}",
    "@media (prefers-color-scheme: dark) {",
    "  :root {",
    ...palette(colors.dark).map((line) => `  ${line}`),
    "  }",
    "}",
    ...types,
    "",
  ].join("\n");
}
