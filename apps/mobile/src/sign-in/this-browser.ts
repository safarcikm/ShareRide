import { signInWays, type SignInWay } from "@shareride/domain";
import { readPreference, writePreference } from "@/lib/preferences";

// What this browser (or phone) keeps about signing in (spec 29, section 5;
// R29.5): the way it last signed in with, the ID of its own PuffinRide
// passkey, and when "Not now" was pressed. Never an email or an account,
// and never sent to the API. A failure to read is "nothing kept".

const lastWayKey = "last-sign-in";
const passkeyHereKey = "passkey-here";
const declinedKey = "passkey-offer-declined";

/**
 * The mark of a passkey this browser has but did not name: it refused a
 * second one as set up already (spec 29, 3.2, item 5).
 */
export const unnamedPasskey = "*";

/** The way this browser last signed in with, or null. */
export async function lastWay(): Promise<SignInWay | null> {
  const kept = await readPreference(lastWayKey);
  return signInWays.find((way) => way === kept) ?? null;
}

export function rememberWay(way: SignInWay): Promise<void> {
  return writePreference(lastWayKey, way);
}

/** The credential ID of the PuffinRide passkey this browser has, `unnamedPasskey`, or null. */
export async function passkeyHere(): Promise<string | null> {
  const kept = await readPreference(passkeyHereKey);
  return kept === null || kept === "" ? null : kept;
}

/** This browser signed in with, set up, or refused a second passkey. */
export function markPasskeyHere(credentialId: string): Promise<void> {
  return writePreference(passkeyHereKey, credentialId);
}

/**
 * A passkey removed in Sign-in methods: when it is this browser's, or this
 * browser's is unnamed, the browser is no longer known to have one, and
 * Face ID is no longer kept as the way used last time (spec 29, 3.5).
 */
export async function forgetPasskeyHere(credentialId: string): Promise<void> {
  const kept = await passkeyHere();
  if (kept !== credentialId && kept !== unnamedPasskey) return;
  await writePreference(passkeyHereKey, "");
  if ((await lastWay()) === "passkey") await writePreference(lastWayKey, "");
}

/** When "Not now" was last pressed on this browser, or null. */
export async function offerDeclinedAt(): Promise<Date | null> {
  const kept = await readPreference(declinedKey);
  if (kept === null) return null;
  const at = new Date(kept);
  return Number.isNaN(at.getTime()) ? null : at;
}

export function declineOffer(at: Date): Promise<void> {
  return writePreference(declinedKey, at.toISOString());
}
