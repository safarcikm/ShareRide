import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import type {
  DevicePasskeys,
  PasskeyAssertion,
  PasskeyOptions,
  PasskeyRegistration,
} from "./passkey-types";

export { passkeyFailure } from "./passkey-types";
export type {
  DevicePasskeys,
  PasskeyAssertion,
  PasskeyOptions,
  PasskeyRegistration,
} from "./passkey-types";

// On the website: the browser's own passkey sheet (spec 27, 3.3 and 3.6).
// Offered only where the browser says the device has a built-in
// authenticator, never a hardware key (ADR 0048).

export const devicePasskeys: DevicePasskeys = {
  async available() {
    if (!browserSupportsWebAuthn()) return false;
    try {
      return await platformAuthenticatorIsAvailable();
    } catch {
      return false;
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
