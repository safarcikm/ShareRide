import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio } from "./contrast";
import { colors, typography } from "./tokens";

// Every pair spec 15 (section 4.1) promises, in both colour schemes.
const textPairs = [
  ["text", "background"],
  ["text", "surface"],
  ["textMuted", "background"],
  ["textMuted", "surface"],
  ["primary", "background"],
  ["primary", "surface"],
  ["onPrimary", "primary"],
  ["primary", "primarySoft"],
  ["error", "background"],
  ["error", "surface"],
  ["onError", "error"],
  ["text", "errorSoft"],
  ["text", "infoSoft"],
] as const;

const edgePairs = [
  ["control", "background"],
  ["control", "surface"],
  ["focus", "background"],
  ["focus", "surface"],
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

  it("sets weights through the font face only", () => {
    for (const style of Object.values(typography)) {
      expect(style).not.toHaveProperty("fontWeight");
    }
  });

  it("keeps fontWeight out of the components", () => {
    // Android ignores fontWeight for custom fonts and may fall back to the
    // system font, so weights come from the font face (spec 15, section 6).
    const folder = join(__dirname, "..", "components");
    const offenders = readdirSync(folder).filter((file) =>
      readFileSync(join(folder, file), "utf8").includes("fontWeight"),
    );
    expect(offenders).toEqual([]);
  });
});
