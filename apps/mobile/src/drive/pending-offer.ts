import { readAppData, writeAppData } from "@/lib/app-data";

// "Offer a ride" pressed before someone had an account (spec 1, 3.1, item
// 3): kept on the device while they sign up, so Ready to drive opens
// afterwards. Only the time it was kept, in the app's own storage. Keeping
// it forgets a booking kept before (pending-booking.ts), and the other way
// round, so sign-up goes on to the last thing chosen.

export const pendingOfferKey = "pending-offer";

/** Signing up takes a few minutes; an offer older than this is forgotten. */
const lifetimeMs = 60 * 60 * 1000;

export async function keepPendingOffer(at: Date): Promise<void> {
  // The key in pending-booking.ts, which imports this module.
  await writeAppData("pending-booking", "");
  await writeAppData(pendingOfferKey, JSON.stringify({ keptAt: at.toISOString() }));
}

/** Whether an offer was kept within the last hour, once: taking it forgets it. */
export async function takePendingOffer(at: Date): Promise<boolean> {
  const stored = await readAppData(pendingOfferKey);
  if (stored === null || stored === "") return false;
  await writeAppData(pendingOfferKey, "");
  let keptAt: unknown;
  try {
    keptAt = (JSON.parse(stored) as { keptAt?: unknown } | null)?.keptAt;
  } catch {
    return false;
  }
  const age = typeof keptAt === "string" ? at.getTime() - Date.parse(keptAt) : Number.NaN;
  return age >= 0 && age <= lifetimeMs;
}

/** Forgets a kept offer, when a booking is chosen after it. */
export function forgetPendingOffer(): Promise<void> {
  return writeAppData(pendingOfferKey, "");
}
