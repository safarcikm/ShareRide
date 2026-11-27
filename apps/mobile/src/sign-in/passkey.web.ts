import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  getBrowserCapabilities,
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
// its quiet request in the email field (spec 29, 3.1), and the passkey it
// may save by itself after a password (3.3). Offered only
// where the browser says the device has a built-in authenticator, never a
// hardware key (ADR 0048).

/** How long `forget` waits for the browser, at most. */
const forgetWaitMs = 1_000;
/**
 * How long the browser may take to decide on saving a passkey by itself.
 * One that has not by then, as Chromium without a saved password, is
 * stopped, and the offer opens instead (spec 29, 3.3).
 */
const quietSaveWaitMs = 3_000;

/**
 * The number of the newest request to the browser this app started: each
 * new one ends the one before, so a timer may end only a request that is
 * still the newest.
 */
let newest = 0;
function started(): number {
  newest += 1;
  return newest;
}

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
    started();
    return (await startAuthentication({
      optionsJSON,
      useBrowserAutofill: true,
    })) as unknown as PasskeyAssertion;
  },
  cancel() {
    WebAuthnAbortService.cancelCeremony();
  },
  async quietCreateAvailable() {
    if (!(await hasLock())) return false;
    try {
      return (await getBrowserCapabilities()).conditionalCreate === "supported";
    } catch {
      return false;
    }
  },
  async createQuietly(options) {
    const optionsJSON = options as unknown as PublicKeyCredentialCreationOptionsJSON;
    const mine = started();
    const timer = setTimeout(() => {
      // Only this request: a sheet opened since is never ended here.
      if (newest === mine) WebAuthnAbortService.cancelCeremony();
    }, quietSaveWaitMs);
    try {
      return (await startRegistration({
        optionsJSON,
        useAutoRegister: true,
      })) as unknown as PasskeyRegistration;
    } finally {
      clearTimeout(timer);
    }
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
    started();
    return (await startRegistration({ optionsJSON })) as unknown as PasskeyRegistration;
  },
};
