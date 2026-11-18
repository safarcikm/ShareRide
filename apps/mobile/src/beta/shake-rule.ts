// When a phone counts as shaken (spec 12, 3.3.1): the accelerometer reads
// about 1 g at rest, and a deliberate shake swings well past 2 g several
// times within a second. A bump, or a phone put down, does so once.

export interface Acceleration {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const shakeRule = {
  /** A swing: this much, in g. */
  swing: 2.3,
  /** This many swings... */
  swings: 3,
  /** ...within this long count as a shake. */
  withinMs: 1000,
  /** After a shake, nothing counts for this long, so one shake opens one form. */
  restMs: 3000,
} as const;

/** Tells a shake from the phone's readings; call `reading` with each one. */
export function createShakeDetector(): {
  reading(acceleration: Acceleration, atMs: number): boolean;
} {
  let swings: number[] = [];
  let restUntil = 0;
  return {
    reading({ x, y, z }, atMs) {
      if (atMs < restUntil) return false;
      if (Math.hypot(x, y, z) < shakeRule.swing) return false;
      swings = [...swings.filter((at) => atMs - at <= shakeRule.withinMs), atMs];
      if (swings.length < shakeRule.swings) return false;
      swings = [];
      restUntil = atMs + shakeRule.restMs;
      return true;
    },
  };
}
