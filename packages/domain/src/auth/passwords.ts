import { err, ok, type Result } from "../result.ts";
import type { RateLimitRule } from "./rate-limit.ts";

// Members' passwords (spec 27, ADR 0047): optional, on top of the email code.

/** Why a new password is refused (R27.2). */
export type PasswordProblem = "too_short" | "too_long" | "too_common" | "is_email";

export const passwordRules = { minLength: 10, maxLength: 128 } as const;

/**
 * Checks a new password and gives the form to hash: Unicode NFC, so a
 * character typed in two parts matches itself later. Length counts
 * characters, not bytes. `isCommon` gets the password lowercased; the list
 * lives with the API, outside this package (R27.2).
 */
export function checkNewPassword(
  password: string,
  email: string | null,
  isCommon: (lowered: string) => boolean,
): Result<string, PasswordProblem> {
  const normalised = password.normalize("NFC");
  // Code points, as NIST counts them: an emoji of several parts counts more than once.
  const length = Array.from(normalised).length;
  if (length < passwordRules.minLength) return err("too_short");
  if (length > passwordRules.maxLength) return err("too_long");
  const lowered = normalised.toLowerCase();
  if (email !== null && lowered.trim() === email.toLowerCase()) return err("is_email");
  if (isCommon(lowered)) return err("too_common");
  return ok(normalised);
}

/** Wrong passwords allowed (R27.4): per email, and per network address (IPv6 by its /64). */
export const passwordSignInLimits = {
  perEmail: [{ limit: 10, windowSeconds: 3600 }],
  perIpAddress: [{ limit: 30, windowSeconds: 3600 }],
} as const satisfies Record<string, readonly RateLimitRule[]>;

/** scrypt's settings (ADR 0047): N = 2^logN, 32 MiB of memory per hash. */
export const scryptSettings = { logN: 15, r: 8, p: 3, saltBytes: 16, keyBytes: 32 } as const;

/** How recent a sign-in proves the person, in place of a confirm code (R27.5). */
export const freshSignInSeconds = 10 * 60;

/**
 * Whether adding or changing a password, or setting up a passkey, needs a
 * confirm code: unless this device signed in less than 10 minutes ago (R27.5).
 */
export function needsProof(sessionStartedAt: Date, now: Date): boolean {
  return now.getTime() - sessionStartedAt.getTime() >= freshSignInSeconds * 1000;
}
