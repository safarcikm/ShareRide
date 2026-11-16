import { addIcelandMonths } from "./calendar.ts";
import { privacySettings } from "./settings.ts";

/**
 * How long a suspended person's number is kept as a hash after their data is
 * erased, so it cannot sign up again (R11.9): until the suspension ends, at
 * most 3 years; a permanent suspension (no end) gets the 3 years. Null when
 * the suspension has already ended and nothing needs keeping.
 */
export function blockedNumberUntil(suspendedUntil: Date | null, erasedAt: Date): Date | null {
  const longest = addIcelandMonths(erasedAt, privacySettings.blockedNumberMaxYears * 12);
  if (suspendedUntil === null) return longest;
  if (suspendedUntil <= erasedAt) return null;
  return suspendedUntil < longest ? suspendedUntil : longest;
}
