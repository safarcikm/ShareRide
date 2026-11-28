import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast.ts";
import {
  asideMaxWidth,
  colors,
  icelandScene,
  icelandSeasons,
  maxContentWidth,
  carDrawing,
  motion,
  pageMaxWidth,
  people,
  puffin,
  sideColumnWidth,
  signInBrands,
  spacing,
  typeScale,
} from "./tokens.ts";

// Every pair spec 15 (section 4.1) promises, in both colour schemes.
const textPairs = [
  ["text", "background"],
  ["text", "surface"],
  ["textMuted", "background"],
  ["textMuted", "surface"],
  ["primary", "background"],
  ["primary", "surface"],
  ["onPrimary", "primary"],
  // A primary button under the pointer (spec 18, 3.4).
  ["onPrimary", "primaryHover"],
  ["primary", "primarySoft"],
  // A row under the pointer is tinted, and keeps its text (spec 18, 3.4).
  ["text", "primarySoft"],
  ["textMuted", "primarySoft"],
  ["error", "background"],
  ["error", "surface"],
  ["onError", "error"],
  // A red main button under the pointer (spec 31, 3.19).
  ["onError", "errorHover"],
  ["text", "errorSoft"],
  ["text", "infoSoft"],
  // Tags (spec 15, section 4.1); positive is primary on primarySoft, above.
  ["warning", "warningSoft"],
  ["info", "infoSoft"],
  ["womenOnly", "womenOnlySoft"],
  // A tag for a problem, such as "Did not show up", and a row that cannot
  // be undone under the pointer (spec 31, 3.3).
  ["error", "errorSoft"],
  // What needs you: the bold line on the card's soft yellow (spec 31, 3.3).
  ["text", "warningSoft"],
] as const;

const edgePairs = [
  ["control", "background"],
  ["control", "surface"],
  ["focus", "background"],
  ["focus", "surface"],
  ["rating", "background"],
  ["rating", "surface"],
] as const;

describe.each(["light", "dark"] as const)("%s colours", (scheme) => {
  it.each(textPairs)("%s on %s is at least 4.5:1", (foreground, background) => {
    expect(
      contrastRatio(colors[scheme][foreground], colors[scheme][background]),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(edgePairs)("%s on %s is at least 3:1", (foreground, background) => {
    expect(
      contrastRatio(colors[scheme][foreground], colors[scheme][background]),
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("what needs you (spec 31, 3.3)", () => {
  it("shows its icon on the car's yellow", () => {
    expect(contrastRatio(people.face, people.sun)).toBeGreaterThanOrEqual(3);
  });
});

describe("the puffin (spec 15, sections 4.2 and 4.9)", () => {
  // Drawing colours carry no text, but the white face must stand out from the
  // black around it, on the moss icon and on the dark one, or it is no puffin.
  it.each([
    ["the logo", people.face],
    ["the dark icon", carDrawing.dark.body],
    ["a scene on the night screen", puffin.nightBlack],
  ])("shows its face against its black in %s", (_, black) => {
    expect(contrastRatio(puffin.white, black)).toBeGreaterThanOrEqual(3);
  });

  it("lifts its black on the night screen, so its shape stands off it (section 5.3)", () => {
    expect(contrastRatio(puffin.nightBlack, colors.dark.background)).toBeGreaterThan(
      contrastRatio(people.face, colors.dark.background),
    );
  });
});

/**
 * Where words stand on the Iceland scene (spec 36, R36.1): on a phone the
 * name, the Beta label and the language link on the sky's top; on a laptop
 * the title and its line on any of the land's colours.
 */
const underWords = ["skyTop", "sky", "far", "mountain", "glacier", "hillBack", "hill"] as const;

describe.each(["light", "dark"] as const)(
  "the Iceland scene, %s (spec 15, section 5.3)",
  (scheme) => {
    const scene = icelandScene[scheme];
    const page = colors[scheme];

    // A road's scene elsewhere: words stand on its sky.
    it.each(["text", "primary"] as const)("keeps %s readable on its sky", (ink) => {
      expect(contrastRatio(page[ink], scene.sky)).toBeGreaterThanOrEqual(4.5);
    });

    it("has the same parts as the other scheme", () => {
      expect(Object.keys(scene)).toEqual(Object.keys(icelandScene.light));
    });
  },
);

describe.each(
  (["winter", "spring", "summer", "autumn"] as const).flatMap((season) =>
    (["light", "dark"] as const).map((scheme) => [season, scheme] as const),
  ),
)("the Iceland scene in %s, %s (spec 36, R36.1)", (season, scheme) => {
  const scene = icelandSeasons[season][scheme];
  const page = colors[scheme];

  it.each(["text", "primary"] as const)("keeps %s readable on the sky's top", (ink) => {
    expect(contrastRatio(page[ink], scene.skyTop)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(underWords)("keeps the text readable on %s", (part) => {
    expect(contrastRatio(page.text, scene[part])).toBeGreaterThanOrEqual(4.5);
  });

  it("has every part, and snow only in winter", () => {
    expect(Object.keys(scene).filter((part) => part !== "snow")).toEqual([
      ...underWords,
      "road",
      "roadLine",
      "roof",
    ]);
    expect("snow" in scene).toBe(season === "winter");
  });
});

describe.each(["light", "dark"] as const)("%s sign-in buttons", (scheme) => {
  const brand = signInBrands[scheme];
  const page = colors[scheme];

  it("has text that reads on its button", () => {
    expect(contrastRatio(brand.googleText, brand.googleFill)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(brand.appleText, brand.appleFill)).toBeGreaterThanOrEqual(4.5);
  });

  it("has buttons that stand out from the screen", () => {
    for (const behind of [page.background, page.surface]) {
      expect(contrastRatio(brand.googleBorder, behind)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(brand.appleFill, behind)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("tokens", () => {
  it("has the same colour keys in light and dark", () => {
    expect(Object.keys(colors.dark)).toEqual(Object.keys(colors.light));
  });

  it("computes known contrast ratios", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#1F2A30", "#EEF3F4")).toBeCloseTo(13.1, 1);
  });

  it("makes a wide page as wide as the column, a gap and the map beside it", () => {
    expect(pageMaxWidth).toBe(maxContentWidth + spacing.lg + asideMaxWidth);
    expect(pageMaxWidth).toBe(1144);
    // A main column beside the side column stays wider than it at 900 wide.
    expect(sideColumnWidth).toBe(400);
  });

  it("sets weights through the font face only", () => {
    for (const style of Object.values(typeScale)) {
      expect(style).not.toHaveProperty("fontWeight");
    }
  });
});

describe("motion (spec 33, section 6)", () => {
  const { arrival } = motion;

  it("ends the car's arrival by the time a celebration takes", () => {
    expect(arrival.drive).toBeLessThanOrEqual(arrival.settle);
    for (const at of arrival.hops) {
      expect(at + arrival.hop).toBeLessThanOrEqual(motion.celebrate);
    }
    expect(arrival.settle).toBeLessThanOrEqual(motion.celebrate);
  });

  it("hops once the car has stopped, the passenger first", () => {
    const [you, driver] = arrival.hops;
    expect(you).toBeGreaterThan(arrival.drive);
    expect(driver).toBeGreaterThan(you);
  });

  it("moves the drawing only a little: a few points, a few degrees", () => {
    for (const bump of arrival.bumps) expect(bump).toBeLessThanOrEqual(2);
    for (const dip of arrival.dip) expect(Math.abs(dip)).toBeLessThanOrEqual(3);
    expect(arrival.hopHeight).toBeLessThanOrEqual(6);
  });

  it("moves nothing on its own for more than 5 seconds (R33.3)", () => {
    expect(motion.celebrate).toBeLessThan(5000);
  });

  it("lets what arrives leave at once, never starting slowly (no ease-in)", () => {
    for (const curve of [motion.curves.out, motion.curves.brake, motion.curves.rise]) {
      const handle = /^cubic-bezier\(([\d.]+), ([\d.]+),/.exec(curve);
      expect(handle).not.toBeNull();
      // The first handle rises at least as fast as it goes along.
      expect(Number(handle?.[2])).toBeGreaterThanOrEqual(Number(handle?.[1]));
    }
  });
});
