import { randomUUID } from "expo-crypto";

/**
 * A new key for one booking attempt (R5.4): the booking screen makes one
 * when it opens and sends it with every try, so a double tap or a retry on a
 * poor connection never books twice.
 */
export function newAttemptKey(): string {
  return randomUUID();
}
