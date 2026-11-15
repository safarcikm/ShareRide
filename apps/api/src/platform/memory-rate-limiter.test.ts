import { describe, expect, it } from "vitest";
import { createMemoryRateLimiter } from "./memory-rate-limiter.ts";

const rules = [
  { limit: 3, windowSeconds: 60 },
  { limit: 5, windowSeconds: 3600 },
];

function limiterAt(start: string, maxKeys = 100) {
  let now = new Date(start);
  const limiter = createMemoryRateLimiter({ rules, clock: () => now, maxKeys });
  return {
    limiter,
    advance: (seconds: number) => {
      now = new Date(now.getTime() + seconds * 1000);
    },
  };
}

describe("createMemoryRateLimiter", () => {
  it("allows events up to the limit, then says how long to wait", () => {
    const { limiter, advance } = limiterAt("2026-11-14T12:00:00Z");
    expect([1, 2, 3].map(() => limiter.hit("a").ok)).toEqual([true, true, true]);
    advance(10);
    expect(limiter.hit("a")).toEqual({
      ok: false,
      error: { code: "rate_limited", retryAfterSeconds: 50 },
    });
    advance(50);
    expect(limiter.hit("a").ok).toBe(true);
  });

  it("does not count refused events, and keeps keys apart", () => {
    const { limiter, advance } = limiterAt("2026-11-14T12:00:00Z");
    for (let index = 0; index < 3; index += 1) limiter.hit("a");
    for (let index = 0; index < 10; index += 1) expect(limiter.hit("a").ok).toBe(false);
    expect(limiter.hit("b").ok).toBe(true);
    advance(60);
    expect(limiter.hit("a").ok).toBe(true);
  });

  it("applies the longest window too", () => {
    const { limiter, advance } = limiterAt("2026-11-14T12:00:00Z");
    for (let index = 0; index < 5; index += 1) {
      expect(limiter.hit("a").ok).toBe(true);
      advance(61);
    }
    const refused = limiter.hit("a");
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.retryAfterSeconds).toBe(3600 - 5 * 61);
  });

  it("forgets keys once their events leave the longest window", () => {
    const { limiter, advance } = limiterAt("2026-11-14T12:00:00Z");
    for (const key of ["a", "b", "c"]) limiter.hit(key);
    for (let index = 0; index < 3; index += 1) limiter.hit("d");
    advance(1800);
    limiter.hit("a");
    expect(limiter.hit("d").ok).toBe(true);
    advance(1801);
    limiter.hit("e");
    // b and c were last seen over an hour ago; a, d and e since.
    expect(limiter.size()).toBe(3);
    advance(3600);
    limiter.hit("f");
    expect(limiter.size()).toBe(1);
  });

  it("forgets the oldest keys past the most it keeps", () => {
    const { limiter } = limiterAt("2026-11-14T12:00:00Z", 2);
    for (let index = 0; index < 3; index += 1) limiter.hit("a");
    limiter.hit("b");
    limiter.hit("c");
    expect(limiter.size()).toBe(2);
    expect(limiter.hit("a").ok).toBe(true);
  });
});
