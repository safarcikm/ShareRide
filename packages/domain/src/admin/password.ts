// The console's temporary password sign-in (ADR 0041).

import type { RateLimitRule } from "../auth/rate-limit.ts";

export const operatorPasswordRules = {
  /** ADMIN_PASSWORD is refused when shorter. */
  minLength: 12,
  /** Tries to sign in with the password per network address, on top of the console's own limit. */
  triesPerAddress: [
    { limit: 5, windowSeconds: 60 },
    { limit: 20, windowSeconds: 3600 },
  ] as readonly RateLimitRule[],
  /**
   * Tries from all network addresses together, so guessing from many
   * addresses is slow too. Well above one address's hour, so one address
   * cannot use it up and lock the operator out. Passkeys are not held by it.
   */
  triesFromAll: [{ limit: 200, windowSeconds: 3600 }] as readonly RateLimitRule[],
} as const;
