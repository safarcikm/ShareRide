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

/** The ways in (spec 29, 3.2 and 3.5): Google, Apple, a passkey, a password or the email code. */
export const signInWays = ["google", "apple", "passkey", "password", "email"] as const;
export type SignInWay = (typeof signInWays)[number];

/** "Use Face ID or fingerprint next time?" after another way in (spec 29, 3.2). */
export const passkeyOfferRules = {
  /** After "Not now", this browser is asked again this many days later. */
  askAgainAfterDays: 30,
} as const;

/** What decides whether a sign-in is followed by the offer (R29.2). */
export interface PasskeyOfferInput {
  readonly isNewUser: boolean;
  readonly way: SignInWay;
  /** The browser reports a built-in authenticator (spec 27, 3.1, item 1). */
  readonly deviceHasLock: boolean;
  /** `passkeySignIn` in the server's config. */
  readonly serverHasPasskeys: boolean;
  /** This browser is known to have a PuffinRide passkey (spec 29, 3.2, item 5). */
  readonly passkeyHere: boolean;
  /** When "Not now" was last pressed on this browser. */
  readonly declinedAt: Date | null;
  /** A booking, Offer, a report form or a link waits from before signing in. */
  readonly keptChoice: boolean;
  readonly now: Date;
}

/**
 * Whether to ask "Use Face ID or fingerprint next time?" (R29.2): an
 * account from before this sign-in, in by any way but a passkey, on a
 * browser that can keep one and is not known to have one, not declined
 * there in 30 days, and with nothing kept to open first.
 */
export function passkeyOfferDue(input: PasskeyOfferInput): boolean {
  const { declinedAt, now } = input;
  const askAgainMs = passkeyOfferRules.askAgainAfterDays * 24 * 60 * 60 * 1000;
  const declinedLately = declinedAt !== null && now.getTime() - declinedAt.getTime() < askAgainMs;
  return (
    !input.isNewUser &&
    input.way !== "passkey" &&
    input.deviceHasLock &&
    input.serverHasPasskeys &&
    !input.passkeyHere &&
    !declinedLately &&
    !input.keptChoice
  );
}

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
