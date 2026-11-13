import { describe, expect, it } from "vitest";
import { createTranslator } from "./translator.ts";

describe("createTranslator", () => {
  it("returns the text in the chosen language", () => {
    expect(createTranslator("en")("comingSoon.title")).toBe("Coming soon");
    expect(createTranslator("is")("comingSoon.title")).toBe("Kemur fljótlega");
  });

  it("applies Icelandic plural rules: 1 and 21 are singular, 11 is plural", () => {
    const t = createTranslator("is");
    expect(t("search.tripCount", { count: 1 })).toBe("1 ferð");
    expect(t("search.tripCount", { count: 21 })).toBe("21 ferð");
    expect(t("search.tripCount", { count: 11 })).toBe("11 ferðir");
    expect(t("search.tripCount", { count: 0 })).toBe("Engar ferðir");
  });

  it("applies English plural rules", () => {
    const t = createTranslator("en");
    expect(t("search.tripCount", { count: 1 })).toBe("1 trip");
    expect(t("search.tripCount", { count: 21 })).toBe("21 trips");
  });

  it("formats numbers in a message with the language's separators", () => {
    expect(createTranslator("is")("search.tripCount", { count: 1200 })).toBe("1.200 ferðir");
    expect(createTranslator("en")("search.tripCount", { count: 1200 })).toBe("1,200 trips");
  });
});
