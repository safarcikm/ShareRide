import type { CDPSession, Page } from "@playwright/test";

const options = {
  protocol: "ctap2",
  transport: "internal",
  hasResidentKey: true,
  hasUserVerification: true,
  isUserVerified: true,
  automaticPresenceSimulation: true,
} as const;

/**
 * Gives the page's browser a virtual authenticator, like a laptop's
 * fingerprint reader: it saves passkeys, signs with them and confirms the
 * user at once, without a prompt. `switchDevice` swaps it for an empty one,
 * as if the operator picked up another device.
 */
export async function addAuthenticator(page: Page) {
  const devtools: CDPSession = await page.context().newCDPSession(page);
  await devtools.send("WebAuthn.enable");
  let { authenticatorId } = await devtools.send("WebAuthn.addVirtualAuthenticator", { options });
  return {
    async switchDevice() {
      await devtools.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
      ({ authenticatorId } = await devtools.send("WebAuthn.addVirtualAuthenticator", { options }));
    },
  };
}
