import { describe, expect, it } from "vitest";
import { pickLocale } from "./locales.ts";

describe("pickLocale (spec 1, section 3.1)", () => {
  it("uses Icelandic when the device prefers it", () => {
    expect(pickLocale(["is-IS", "en-US"])).toBe("is");
    expect(pickLocale(["is"])).toBe("is");
  });

  it("uses English when the device prefers it", () => {
    expect(pickLocale(["en-GB"])).toBe("en");
  });

  it("uses the first supported language in the device's order", () => {
    expect(pickLocale(["pl-PL", "is-IS"])).toBe("is");
  });

  it("falls back to English for any other language", () => {
    expect(pickLocale(["pl-PL", "de-DE"])).toBe("en");
    expect(pickLocale([])).toBe("en");
  });
});
