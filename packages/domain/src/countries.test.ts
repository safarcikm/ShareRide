import { describe, expect, it } from "vitest";
import { isSupportedCountry, supportedCountries } from "./countries.ts";

describe("supported countries (spec 1, decision 3)", () => {
  it("cover Iceland, the EEA, the UK, the US and Canada: 33 countries", () => {
    expect(supportedCountries).toHaveLength(33);
    for (const country of ["IS", "NO", "LI", "PL", "DE", "GB", "US", "CA"]) {
      expect(isSupportedCountry(country)).toBe(true);
    }
  });

  it("list Iceland first, as the default", () => {
    expect(supportedCountries[0]).toBe("IS");
  });

  it("exclude other countries", () => {
    for (const country of ["CH", "AU", "RU", "XX", ""]) {
      expect(isSupportedCountry(country)).toBe(false);
    }
  });
});
