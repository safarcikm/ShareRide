import { describe, expect, it } from "vitest";
import {
  analyticsConsentMonths,
  consentHolds,
  googleCookieExpirySeconds,
  isGoogleMeasurementId,
} from "./consent.ts";

describe("the choice about Google Analytics (spec 23, R23.5)", () => {
  const savedAt = new Date("2026-11-22T21:00:00Z");

  it("holds for 12 months, then is asked again", () => {
    expect(analyticsConsentMonths).toBe(12);
    expect(consentHolds(savedAt, new Date("2027-11-22T20:59:59Z"))).toBe(true);
    expect(consentHolds(savedAt, new Date("2027-11-22T21:00:00Z"))).toBe(false);
  });

  it("does not hold when it was saved in the future, as with a clock set wrong", () => {
    expect(consentHolds(savedAt, new Date("2026-11-22T20:00:00Z"))).toBe(false);
    expect(consentHolds(savedAt, savedAt)).toBe(true);
  });

  it("lets Google's cookies last 13 months (3.3, item 5)", () => {
    expect(googleCookieExpirySeconds).toBe(395 * 24 * 3600);
  });
});

describe("a Google Analytics measurement ID (spec 23, section 6)", () => {
  it("is G- and capital letters and digits", () => {
    expect(isGoogleMeasurementId("G-ABC123XYZ9")).toBe(true);
    for (const value of ["", "G-", "UA-12345-1", "g-abc123", "G-ABC 123", 'G-1"><script>']) {
      expect(isGoogleMeasurementId(value), value).toBe(false);
    }
  });
});
