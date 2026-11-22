import { consentHolds } from "@shareride/domain";
import { readPreference, writePreference } from "@/lib/preferences";

/** The visitor's answer to the question about Google Analytics (spec 23, 3.1). */
export type ConsentChoice = "accepted" | "declined";

/** Where the browser keeps it (spec 23, section 6). */
export const consentKey = "analytics-consent";

/** The choice and when it was made, as kept: nothing else (3.1, item 6). */
export const consentRecord = (choice: ConsentChoice, now: Date): string =>
  JSON.stringify({ choice, at: now.toISOString() });

/**
 * The choice kept, while it holds (12 months, R23.5); null when there is
 * none, it is older, or it does not read, so the bar asks.
 */
export function savedChoice(raw: string | null, now: Date): ConsentChoice | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as { choice?: unknown; at?: unknown } | null;
    if (value === null || typeof value !== "object") return null;
    const { choice, at } = value;
    if ((choice !== "accepted" && choice !== "declined") || typeof at !== "string") return null;
    const savedAt = new Date(at);
    if (Number.isNaN(savedAt.getTime())) return null;
    return consentHolds(savedAt, now) ? choice : null;
  } catch {
    return null;
  }
}

/** The choice this browser keeps, if it still holds. */
export async function readChoice(now: Date): Promise<ConsentChoice | null> {
  return savedChoice(await readPreference(consentKey), now);
}

/** Keeps the choice in this browser, with when it was made. */
export function saveChoice(choice: ConsentChoice, now: Date): Promise<void> {
  return writePreference(consentKey, consentRecord(choice, now));
}
