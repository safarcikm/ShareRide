import type { RateLimitRule } from "./rate-limit.ts";

// Face ID or fingerprint for members: passkeys kept on the device (spec 27,
// ADR 0048).

export const memberPasskeyRules = {
  /** Devices per account (R27.8). The console's are `passkeyRules`. */
  perAccount: 10,
  /** How long the browser has to answer a challenge. */
  challengeSeconds: 5 * 60,
  /**
   * Sign-in challenges per address (its /64 for IPv6), so nobody fills the
   * table. Room for step 1's quiet request, which asks on every visit and
   * again every 4.5 minutes (R29.6).
   */
  signInOptionsLimits: [{ limit: 60, windowSeconds: 10 * 60 }] satisfies readonly RateLimitRule[],
} as const;

const browsers: readonly (readonly [RegExp, string])[] = [
  [/\bEdg(A|iOS)?\//, "Edge"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\b(Firefox|FxiOS)\//, "Firefox"],
  [/\b(Chrome|CriOS)\//, "Chrome"],
  [/\bVersion\/[\d.]+.*Safari\//, "Safari"],
];

const systems: readonly (readonly [RegExp, string])[] = [
  [/\biPhone\b/, "iPhone"],
  [/\biPad\b/, "iPad"],
  [/\bAndroid\b/, "Android"],
  [/\bMacintosh\b/, "Mac"],
  [/\bWindows\b/, "Windows"],
  [/\bCrOS\b/, "Chromebook"],
  [/\bLinux\b/, "Linux"],
];

/** A device as its browser names it: brand names, shown as they are. */
export interface DeviceName {
  readonly browser: string;
  readonly system: string;
}

/**
 * A device's browser and system from the browser that set up its passkey,
 * such as Safari and iPhone (spec 27, 3.6): no field to type a name. The app
 * words them ("Safari on iPhone"); null when they cannot be told.
 */
export function deviceName(userAgent: string): DeviceName | null {
  const browser = browsers.find(([pattern]) => pattern.test(userAgent))?.[1];
  const system = systems.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (browser === undefined || system === undefined) return null;
  return { browser, system };
}
