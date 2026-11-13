import { err, ok, type Result } from "../result.ts";

export interface RateLimitRule {
  readonly limit: number;
  readonly windowSeconds: number;
}

export interface RateLimited {
  readonly code: "rate_limited";
  readonly retryAfterSeconds: number;
}

/**
 * Whether one more event may happen now, given the times of earlier events
 * with the same key. When refused, says how long until it would be allowed.
 */
export function checkRateLimits(
  earlier: readonly Date[],
  rules: readonly RateLimitRule[],
  now: Date,
): Result<undefined, RateLimited> {
  let retryAfterSeconds = 0;
  for (const rule of rules) {
    const windowStart = now.getTime() - rule.windowSeconds * 1000;
    const inWindow = earlier
      .map((time) => time.getTime())
      .filter((time) => time > windowStart)
      .sort((a, b) => a - b);
    if (inWindow.length >= rule.limit) {
      // The event that must leave the window before another is allowed.
      const blocking = inWindow[inWindow.length - rule.limit] ?? now.getTime();
      const wait = Math.ceil((blocking + rule.windowSeconds * 1000 - now.getTime()) / 1000);
      retryAfterSeconds = Math.max(retryAfterSeconds, wait);
    }
  }
  return retryAfterSeconds > 0 ? err({ code: "rate_limited", retryAfterSeconds }) : ok(undefined);
}
