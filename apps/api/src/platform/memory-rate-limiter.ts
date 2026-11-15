import {
  checkRateLimits,
  ok,
  type RateLimited,
  type RateLimitRule,
  type Result,
} from "@shareride/domain";

export interface RateLimiter {
  /** Counts one event for `key` now, or says how long to wait; refused events do not count. */
  hit(key: string): Result<undefined, RateLimited>;
  /** How many keys it remembers. */
  size(): number;
}

/**
 * Rate limits kept in this process's memory, for frequent events where a
 * database row each would cost too much, such as searches. A key is
 * forgotten once its last event leaves the longest window, and the least
 * recently counted go first when more than `maxKeys` are held. Each server
 * instance counts on its own, and a restart starts again.
 */
export function createMemoryRateLimiter(options: {
  readonly rules: readonly RateLimitRule[];
  readonly clock: () => Date;
  readonly maxKeys?: number;
}): RateLimiter {
  const { rules, clock, maxKeys = 50_000 } = options;
  const longestMs = Math.max(...rules.map((rule) => rule.windowSeconds)) * 1000;
  /**
   * Event times per key, in the order of each key's last counted event, so
   * the keys to forget are always at the front.
   */
  const events = new Map<string, number[]>();

  function forget(now: number) {
    for (const [key, times] of events) {
      const fresh = (times.at(-1) ?? 0) > now - longestMs;
      if (fresh && events.size <= maxKeys) break;
      events.delete(key);
    }
  }

  return {
    hit(key) {
      const now = clock();
      forget(now.getTime());
      const recent = (events.get(key) ?? []).filter((time) => time > now.getTime() - longestMs);
      const check = checkRateLimits(
        recent.map((time) => new Date(time)),
        rules,
        now,
      );
      if (!check.ok) {
        // Refused events do not count, and leave the key where it was.
        events.set(key, recent);
        return check;
      }
      events.delete(key);
      events.set(key, [...recent, now.getTime()]);
      if (events.size > maxKeys) forget(now.getTime());
      return ok(undefined);
    },
    size: () => events.size,
  };
}
