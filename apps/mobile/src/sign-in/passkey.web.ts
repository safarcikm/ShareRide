import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  platformAuthenticatorIsAvailable,
  sendSignal,
  startAuthentication,
  startRegistration,
  WebAuthnAbortService,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import type {
  DevicePasskeys,
  PasskeyAssertion,
  PasskeyOptions,
  PasskeyRegistration,
} from "./passkey-types";

export { keepPasskeyOptionsMs, passkeyFailure } from "./passkey-types";
export type {
  DevicePasskeys,
  PasskeyAssertion,
  PasskeyOptions,
  PasskeyRegistration,
} from "./passkey-types";

// On the website: the browser's own passkey sheet (spec 27, 3.3 and 3.6),
// and its quiet request in the email field (spec 29, 3.1). Offered only
// where the browser says the device has a built-in authenticator, never a
// hardware key (ADR 0048).

/** How long `forget` waits for the browser, at most. */
const forgetWaitMs = 1_000;

async function hasLock(): Promise<boolean> {
  if (!browserSupportsWebAuthn()) return false;
  try {
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

export const devicePasskeys: DevicePasskeys = {
  available: hasLock,
  async autofillAvailable() {
    if (!(await hasLock())) return false;
    try {
      return await browserSupportsWebAuthnAutofill();
    } catch {
      return false;
    }
  },
  async autofill(options) {
    const optionsJSON = options as unknown as PublicKeyCredentialRequestOptionsJSON;
    return (await startAuthentication({
      optionsJSON,
      useBrowserAutofill: true,
    })) as unknown as PasskeyAssertion;
  },
  cancel() {
    WebAuthnAbortService.cancelCeremony();
  },
  async forget(credentialId) {
    try {
      // The site's passkeys are bound to the web app's own host (ADR 0048).
      const rpID = globalThis.location.hostname;
      const told = sendSignal({
        signalName: "unknownCredential",
        rpID,
        credentialID: credentialId,
      });
      // A passkey manager that never answers does not hold the screen up.
      await Promise.race([told, new Promise((done) => setTimeout(done, forgetWaitMs))]);
    } catch {
      // A browser without the Signal API keeps offering it; nothing else changes.
    }
  },
  async create(options) {
    const optionsJSON = options as unknown as PublicKeyCredentialCreationOptionsJSON;
    return (await startRegistration({ optionsJSON })) as unknown as PasskeyRegistration;
  },
  async get(options: PasskeyOptions) {
    const optionsJSON = options as unknown as PublicKeyCredentialRequestOptionsJSON;
    return (await startAuthentication({ optionsJSON })) as unknown as PasskeyAssertion;
  },
};
