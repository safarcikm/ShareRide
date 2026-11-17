import type { CallInput } from "@shareride/api-client";
import type { adminSetupRoute, adminSignInRoute } from "@shareride/contracts";
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

/** Options the API made for the browser's passkey call. */
export type WebAuthnOptions = { readonly challenge: string } & Readonly<Record<string, unknown>>;
/** A new passkey, as the API takes it. */
export type Registration = CallInput<typeof adminSetupRoute>["body"]["credential"];
/** A passkey's answer to a challenge, as the API takes it. */
export type Assertion = CallInput<typeof adminSignInRoute>["body"]["credential"];

/** The browser's passkeys (WebAuthn), behind an interface so tests can stand in. */
export interface PasskeyBrowser {
  supported(): boolean;
  /** Saves a new passkey; throws if the person cancels or it times out. */
  create(options: WebAuthnOptions): Promise<Registration>;
  /** Answers a challenge with a saved passkey; throws like `create`. */
  get(options: WebAuthnOptions): Promise<Assertion>;
}

export const browserPasskeys: PasskeyBrowser = {
  supported: () => browserSupportsWebAuthn(),
  async create(options) {
    const optionsJSON = options as unknown as PublicKeyCredentialCreationOptionsJSON;
    return (await startRegistration({ optionsJSON })) as unknown as Registration;
  },
  async get(options) {
    const optionsJSON = options as unknown as PublicKeyCredentialRequestOptionsJSON;
    return (await startAuthentication({ optionsJSON })) as unknown as Assertion;
  },
};

/** Why the browser's passkey call failed, as a text key. */
export function passkeyFailure(
  error: unknown,
): "admin.passkey.cancelled" | "admin.passkeys.alreadySaved" {
  const name = error instanceof Error ? error.name : "";
  return name === "InvalidStateError" ? "admin.passkeys.alreadySaved" : "admin.passkey.cancelled";
}
