// The console's temporary password sign-in (ADR 0041).

import type { RateLimitRule } from "../auth/rate-limit.ts";

export const operatorPasswordRules = {
  /** ADMIN_PASSWORD is refused when shorter. */
  minLength: 12,
  /**
   * Tries to sign in with the password from all network addresses together,
   * on top of each address's own limit, so guessing from many addresses is
   * slow too. Passkeys are not held by it.
   */
  triesFromAll: [{ limit: 50, windowSeconds: 3600 }] as readonly RateLimitRule[],
} as const;
