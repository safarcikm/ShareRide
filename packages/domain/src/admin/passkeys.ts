// Saving and using the operator's passkeys (ADR 0028).

import type { RateLimitRule } from "../auth/rate-limit.ts";

export const passkeyRules = {
  /** A setup link from the `operator` command works once, for this long. */
  setupLinkMinutes: 30,
  /** A passkey must answer the server's challenge within this time. */
  challengeSeconds: 5 * 60,
  /** What the operator calls a passkey, such as "Laptop" or "Phone". */
  nameMaxLength: 60,
  /**
   * Adding or removing a passkey needs a passkey used this recently, at
   * sign-in or to confirm, so a stolen session alone cannot swap them.
   */
  confirmedMinutes: 5,
} as const;

/**
 * Tries to sign in or use a setup link, per network address. A passkey
 * cannot be guessed, so these only stop someone filling the database with
 * challenges or probing setup links.
 */
export const operatorSignInLimitsPerAddress: readonly RateLimitRule[] = [
  { limit: 10, windowSeconds: 60 },
  { limit: 60, windowSeconds: 3600 },
];

/**
 * How often a recovery code may be sent to an operator's number (spec 22,
 * R22.6), counted apart from the app's sign-in codes of that number.
 */
export const recoveryCodeSendLimits = {
  perNumber: [
    { limit: 1, windowSeconds: 30 },
    { limit: 5, windowSeconds: 3600 },
  ],
} as const satisfies { readonly perNumber: readonly RateLimitRule[] };

export interface SetupLinkState {
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
}

export type SetupLinkCheck = "valid" | "used" | "expired";

export function checkSetupLink(link: SetupLinkState, now: Date): SetupLinkCheck {
  if (link.usedAt !== null) return "used";
  return now.getTime() >= link.expiresAt.getTime() ? "expired" : "valid";
}

/** The last passkey stays: without it the operator could only get back in through the server. */
export function canRemovePasskey(passkeyCount: number): boolean {
  return passkeyCount > 1;
}

/** Whether the operator used a passkey recently enough to change passkeys. */
export function isRecentlyConfirmed(confirmedAt: Date, now: Date): boolean {
  return now.getTime() - confirmedAt.getTime() < passkeyRules.confirmedMinutes * 60_000;
}
