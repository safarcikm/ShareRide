import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast.ts";
import {
  asideMaxWidth,
  colors,
  maxContentWidth,
  pageMaxWidth,
  sideColumnWidth,
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
  // A card or a row under the pointer is tinted, and keeps its text (spec 18, 3.4).
  ["text", "primarySoft"],
  ["textMuted", "primarySoft"],
  ["error", "background"],
  ["error", "surface"],
  ["onError", "error"],
  ["text", "errorSoft"],
  ["text", "infoSoft"],
  // Tags (spec 15, section 4.1); positive is primary on primarySoft, above.
  ["warning", "warningSoft"],
  ["info", "infoSoft"],
  ["womenOnly", "womenOnlySoft"],
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
