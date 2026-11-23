import type { DevicePasskeys } from "./passkey-types";

export { passkeyFailure } from "./passkey-types";
export type {
  DevicePasskeys,
  PasskeyAssertion,
  PasskeyOptions,
  PasskeyRegistration,
} from "./passkey-types";

// Face ID or fingerprint is on the website first; the phone apps follow
// when their builds ship (spec 27, 3.8), so here the device never offers it.

const unavailable = () =>
  Promise.reject(new Error("Face ID or fingerprint is on the website only."));

export const devicePasskeys: DevicePasskeys = {
  available: () => Promise.resolve(false),
  create: unavailable,
  get: unavailable,
};
