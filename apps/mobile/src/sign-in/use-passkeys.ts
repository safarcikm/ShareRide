import type { CallFailure } from "@shareride/api-client";
import {
  addPasskeyRoute,
  passkeySetupOptionsRoute,
  type MemberPasskey,
} from "@shareride/contracts";
import { useEffect, useState } from "react";
import type { SessionManager } from "@/auth/session-manager";
import { useConfig } from "@/beta/config";
import { devicePasskeys, passkeyFailure, type PasskeyOptions } from "./passkey";

/**
 * Whether to offer Face ID or fingerprint (spec 27, 3.1, item 1): the
 * server has it (`passkeySignIn`) and the browser says this device has its
 * own lock to keep a passkey with. Never a hardware key (ADR 0048).
 */
export function usePasskeysOffered(): boolean {
  const { passkeySignIn } = useConfig();
  const [device, setDevice] = useState(false);
  useEffect(() => {
    let live = true;
    void devicePasskeys.available().then((available) => {
      if (live) setDevice(available);
    });
    return () => {
      live = false;
    };
  }, []);
  return passkeySignIn && device;
}

/** Why the API gave no options to set up Face ID or fingerprint. */
export type OptionsRefusal =
  /** The sign-in is over 10 minutes old: a confirm code first (R27.5). */
  | { readonly kind: "confirm_required" }
  /** 10 devices are set up (R27.8). */
  | { readonly kind: "too_many" }
  /** The API refused, as with a wrong confirm code. */
  | { readonly kind: "refused"; readonly failure: CallFailure };

/** How setting up Face ID or fingerprint on this device went. */
export type SetUpOutcome =
  | { readonly kind: "saved"; readonly passkey: MemberPasskey }
  /** The person closed the device's sheet: nothing changes. */
  | { readonly kind: "cancelled" }
  /** The device has a passkey for the account already (3.6, item 3). */
  | { readonly kind: "already" }
  /** The device could not make one, or the API refused its answer. */
  | { readonly kind: "failed" }
  | Exclude<OptionsRefusal, { readonly kind: "confirm_required" }>;

/**
 * The API's options for the device's sheet (3.6, item 2), with `code` when
 * the sign-in is not fresh. They hold a challenge that lasts 5 minutes, and
 * are the proof until then: a code is not asked for again.
 */
export async function passkeySetUpOptions(
  session: Pick<SessionManager, "call">,
  code?: string,
): Promise<{ readonly kind: "options"; readonly options: PasskeyOptions } | OptionsRefusal> {
  const answer = await session.call(passkeySetupOptionsRoute, {
    body: code === undefined ? {} : { code },
  });
  if (answer.ok) return { kind: "options", options: answer.data.options };
  if (answer.error.code === "confirm_required") return { kind: "confirm_required" };
  if (answer.error.code === "too_many") return { kind: "too_many" };
  return { kind: "refused", failure: answer };
}

/**
 * The device's own sheet with those options, then the passkey saved. The
 * verified email is told (R27.7).
 */
export async function savePasskey(
  session: Pick<SessionManager, "call">,
  options: PasskeyOptions,
): Promise<SetUpOutcome> {
  let credential;
  try {
    credential = await devicePasskeys.create(options);
  } catch (error) {
    return { kind: passkeyFailure(error) };
  }
  const saved = await session.call(addPasskeyRoute, { body: { credential } });
  if (saved.ok) return { kind: "saved", passkey: saved.data };
  if (saved.error.code === "too_many") return { kind: "too_many" };
  if (saved.error.code === "passkey_invalid") return { kind: "failed" };
  return { kind: "refused", failure: saved };
}
