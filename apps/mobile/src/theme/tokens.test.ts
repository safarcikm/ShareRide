import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fontFamily, typography, wordsApart } from "./tokens";

describe("the app's type", () => {
  it("falls back to a system font on the web only", () => {
    expect(fontFamily("Fredoka_600SemiBold", "web")).toBe(
      "Fredoka_600SemiBold, system-ui, sans-serif",
    );
    expect(fontFamily("Fredoka_600SemiBold", "android")).toBe("Fredoka_600SemiBold");
    expect(fontFamily("Fredoka_600SemiBold", "ios")).toBe("Fredoka_600SemiBold");
  });

  it("keeps the words of a title apart on the web", () => {
    // Fredoka's space is narrow and its kerning closes it further, so
    // "N1 Vík" read as "N1Vík" (spec 31, 3.18).
    expect(wordsApart("Fredoka_600SemiBold", "web")).toEqual({
      fontKerning: "none",
      wordSpacing: "0.06em",
    });
    expect(wordsApart("Fredoka_500Medium", "web")).toEqual({
      fontKerning: "none",
      wordSpacing: "0.06em",
    });
    expect(wordsApart("Nunito_400Regular", "web")).toEqual({});
    expect(wordsApart("Fredoka_600SemiBold", "ios")).toEqual({});
    expect(wordsApart("Fredoka_600SemiBold", "android")).toEqual({});
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
