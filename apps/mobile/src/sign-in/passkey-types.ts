import type { CallInput } from "@shareride/api-client";
import type { addPasskeyRoute, passkeySignInRoute } from "@shareride/contracts";

// Face ID or fingerprint (spec 27, 3.3 and 3.6; ADR 0048): a passkey kept on
// the device. What the website's module (passkey.web.ts) and the apps'
// (passkey.ts) share.

/** Options the API made for the device's passkey sheet. */
export type PasskeyOptions = { readonly challenge: string } & Readonly<Record<string, unknown>>;
/** A new passkey, as the API takes it. */
export type PasskeyRegistration = CallInput<typeof addPasskeyRoute>["body"]["credential"];
/** A passkey's answer to a challenge, as the API takes it. */
export type PasskeyAssertion = CallInput<typeof passkeySignInRoute>["body"]["credential"];

/** The device's own passkeys, behind an interface so tests can stand in. */
export interface DevicePasskeys {
  /** Whether the device has its own lock to keep one with (Face ID, a fingerprint, Windows Hello). */
  available(): Promise<boolean>;
  /** Makes a passkey kept on this device; throws if the person cancels or it is set up already. */
  create(options: PasskeyOptions): Promise<PasskeyRegistration>;
  /** Answers a challenge with one of the site's passkeys; throws like `create`. */
  get(options: PasskeyOptions): Promise<PasskeyAssertion>;
  /**
   * Whether the browser can offer the site's passkeys in the email field's
   * suggestions (spec 28, 3.1): a built-in lock and a quiet request.
   */
  autofillAvailable(): Promise<boolean>;
  /**
   * The quiet request: waits, with no sheet, until the person picks a
   * passkey from the email field's suggestions. Throws when cancelled.
   */
  autofill(options: PasskeyOptions): Promise<PasskeyAssertion>;
  /** Stops the request that is waiting, quiet or not. */
  cancel(): void;
  /**
   * Tells the browser this site has no passkey `credentialId` any more, so
   * it stops offering it (spec 28, 3.4). Never throws.
   */
  forget(credentialId: string): Promise<void>;
}

/** Why the device's sheet gave no passkey: cancelled, or this device has one already. */
export function passkeyFailure(error: unknown): "cancelled" | "already" | "failed" {
  const name = error instanceof Error ? error.name : "";
  // The browser refuses a second passkey on a device that has one (3.6, item 3).
  if (name === "InvalidStateError") return "already";
  if (name === "NotAllowedError" || name === "AbortError") return "cancelled";
  return "failed";
}
