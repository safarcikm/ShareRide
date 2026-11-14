import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio } from "./contrast";
import { colors, fontFamily, typography } from "./tokens";

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

  it("falls back to a system font on the web only", () => {
    expect(fontFamily("Fredoka_600SemiBold", "web")).toBe(
      "Fredoka_600SemiBold, system-ui, sans-serif",
    );
    expect(fontFamily("Fredoka_600SemiBold", "android")).toBe("Fredoka_600SemiBold");
    expect(fontFamily("Fredoka_600SemiBold", "ios")).toBe("Fredoka_600SemiBold");
  });

  it("sets weights through the font face only", () => {
    for (const style of Object.values(typography)) {
      expect(style).not.toHaveProperty("fontWeight");
    }
  });

  it("keeps fontWeight out of the parts and screens", () => {
    // Android ignores fontWeight for custom fonts and may fall back to the
    // system font, so weights come from the font face (spec 15, section 6).
    const offenders = ["components", "app"].flatMap((folder) =>
      readdirSync(join(__dirname, "..", folder), { recursive: true, encoding: "utf8" })
        .filter((file) => file.endsWith(".tsx") || file.endsWith(".ts"))
        .filter((file) =>
          readFileSync(join(__dirname, "..", folder, file), "utf8").includes("fontWeight"),
        )
        .map((file) => `${folder}/${file}`),
    );
    expect(offenders).toEqual([]);
  });
});
