import { describe, expect, it } from "vitest";
import { checkRateLimits } from "./rate-limit.ts";

const t0 = new Date("2026-11-13T12:00:00Z");
const seconds = (n: number) => new Date(t0.getTime() + n * 1000);

describe("checkRateLimits", () => {
  const rules = [
    { limit: 1, windowSeconds: 30 },
    { limit: 5, windowSeconds: 3600 },
  ];

  it("allows the first event", () => {
    expect(checkRateLimits([], rules, t0)).toEqual({ ok: true, value: undefined });
  });

  it("refuses a second event within 30 seconds and says when to retry", () => {
    expect(checkRateLimits([seconds(0)], rules, seconds(10))).toEqual({
      ok: false,
      error: { code: "rate_limited", retryAfterSeconds: 20 },
    });
  });

  it("allows it once 30 seconds have passed", () => {
    expect(checkRateLimits([seconds(0)], rules, seconds(30))).toMatchObject({ ok: true });
  });

  it("refuses a sixth event within the hour until the oldest leaves the window", () => {
    const sent = [0, 60, 120, 180, 240].map(seconds);
    expect(checkRateLimits(sent, rules, seconds(300))).toEqual({
      ok: false,
      error: { code: "rate_limited", retryAfterSeconds: 3300 },
    });
    expect(checkRateLimits(sent, rules, seconds(3600))).toMatchObject({ ok: true });
  });

  it("ignores events outside every window", () => {
    expect(checkRateLimits([seconds(-7200)], rules, t0)).toMatchObject({ ok: true });
  });
});
