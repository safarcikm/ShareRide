import { randomUUID } from "expo-crypto";

/**
 * A new ID for one message (spec 7, 4.2): the app sends it with every try,
 * so a retry on a poor connection never sends the message twice.
 */
export function newClientId(): string {
  return randomUUID();
}
