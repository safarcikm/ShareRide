import { describe, expect, it } from "vitest";
import { checkRateLimits } from "./rate-limit.ts";
import { checkEmailLink, emailLinkRules, normaliseEmail } from "./email-address.ts";

const t0 = new Date("2026-11-16T12:00:00Z");
const seconds = (n: number) => new Date(t0.getTime() + n * 1000);

describe("normaliseEmail (spec 1, 3.5)", () => {
  it("keeps an address without the spaces around it, in small letters", () => {
    expect(normaliseEmail("  Anna.Jons@Example.COM ")).toEqual({
      ok: true,
      value: "anna.jons@example.com",
    });
  });

  it.each([
    "",
    "anna",
    "anna@",
    "@example.com",
    "anna@example",
    "anna jons@example.com",
    "anna@@example.com",
    "anna@example..com",
    `${"a".repeat(245)}@example.com`,
  ])("refuses %j", (input) => {
    expect(normaliseEmail(input)).toEqual({ ok: false, error: { code: "email_invalid" } });
  });

  it("takes an address up to 254 characters", () => {
    const address = `${"a".repeat(242)}@example.com`;
    expect(address).toHaveLength(254);
    expect(normaliseEmail(address).ok).toBe(true);
  });
});

describe("checkEmailLink (plan 4.6)", () => {
  const link = { sentAt: t0, usedAt: null, failedAt: null, newest: true };

  it("works for 24 hours, once, and only the newest", () => {
    expect(checkEmailLink(link, seconds(24 * 3600 - 1)).ok).toBe(true);
    const invalid = { ok: false, error: { code: "link_invalid" } };
    expect(checkEmailLink(link, seconds(24 * 3600))).toEqual(invalid);
    expect(checkEmailLink({ ...link, usedAt: seconds(10) }, seconds(20))).toEqual(invalid);
    expect(checkEmailLink({ ...link, newest: false }, seconds(20))).toEqual(invalid);
  });

  it("never works when its email was refused", () => {
    expect(checkEmailLink({ ...link, failedAt: seconds(1) }, seconds(20))).toEqual({
      ok: false,
      error: { code: "link_invalid" },
    });
  });

  it("is sent at most once a minute and 5 times a day", () => {
    const { sendLimits } = emailLinkRules;
    expect(checkRateLimits([t0], sendLimits, seconds(59))).toEqual({
      ok: false,
      error: { code: "rate_limited", retryAfterSeconds: 1 },
    });
    expect(checkRateLimits([t0], sendLimits, seconds(60)).ok).toBe(true);
    const five = [0, 60, 120, 180, 240].map(seconds);
    expect(checkRateLimits(five, sendLimits, seconds(3600))).toEqual({
      ok: false,
      error: { code: "rate_limited", retryAfterSeconds: 24 * 3600 - 3600 },
    });
  });
});
