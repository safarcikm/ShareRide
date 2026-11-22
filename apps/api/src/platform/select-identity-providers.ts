import type { SignInConfig } from "../config.ts";
import type { SignInDependencies } from "../app.ts";
import {
  createAppleProvider,
  createDevProvider,
  createGoogleProvider,
  type IdentityProvider,
} from "./identity-providers.ts";

/** The app's own address scheme (apps/mobile/app.json), for the phones' way back. */
export const appScheme = "shareride";

/**
 * The Google and Apple sign-ins the configuration turns on (ADR 0034), and
 * where the browser window may go back to.
 */
export function selectSignIn(config: SignInConfig): SignInDependencies {
  const providers: IdentityProvider[] = [];
  if (config.google.mode === "dev") {
    providers.push(createDevProvider({ name: "google", apiOrigin: config.apiOrigin }));
  }
  if (config.google.mode === "google") {
    providers.push(
      createGoogleProvider({
        clientId: config.google.clientId,
        clientSecret: config.google.clientSecret,
      }),
    );
  }
  if (config.apple.mode === "dev") {
    providers.push(createDevProvider({ name: "apple", apiOrigin: config.apiOrigin }));
  }
  if (config.apple.mode === "apple") {
    providers.push(
      createAppleProvider({
        servicesId: config.apple.servicesId,
        teamId: config.apple.teamId,
        keyId: config.apple.keyId,
        privateKey: config.apple.privateKey,
      }),
    );
  }
  return {
    providers,
    apiOrigin: config.apiOrigin,
    returnUrls: {
      webOrigins: config.returnOrigins,
      appScheme,
      allowExpoGo: config.allowExpoGo,
    },
  };
}
