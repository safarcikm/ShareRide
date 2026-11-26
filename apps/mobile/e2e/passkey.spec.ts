import { generateKeyPairSync, randomBytes } from "node:crypto";
import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { english, enterCodes, finishSignUp, menuLink } from "./support/account";
import { emailTo } from "./support/email";
import { newPhoneNumber } from "./support/sms";

// Spec 27's Face ID or fingerprint journey (section 8) and spec 29's
// (section 7) on the web build, against the test API. Chromium's virtual
// authenticator stands in for the device's own lock: built in
// ("internal"), keeping the passkey, and checking the person (user
// verification), as Face ID or a fingerprint does. It also answers the
// email field's quiet request at once, as a person picking the passkey from
// the field's suggestions would, and takes the Signal API.

test.use({ locale: "en-GB" });

const visible = { visible: true } as const;
const notSetUp =
  "This device's sign-in isn't set up for your PuffinRide account. Use your email, then set it up again in Settings.";

interface DeviceLock {
  readonly session: CDPSession;
  readonly authenticatorId: string;
}

/** Gives this page a device lock that answers at once, before the app asks for one. */
async function addDeviceLock(page: Page): Promise<DeviceLock> {
  const session = await page.context().newCDPSession(page);
  await session.send("WebAuthn.enable");
  const { authenticatorId } = await session.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { session, authenticatorId };
}

/** How many passkeys the device lock keeps. */
async function keptPasskeys({ session, authenticatorId }: DeviceLock): Promise<number> {
  const { credentials } = await session.send("WebAuthn.getCredentials", { authenticatorId });
  return credentials.length;
}

/** A browser that cannot list passkeys among the email field's suggestions: the button only. */
async function withoutSuggestions(page: Page) {
  await page.addInitScript(() => {
    PublicKeyCredential.isConditionalMediationAvailable = () => Promise.resolve(false);
  });
}

/** Sets up Face ID or fingerprint straight after sign-up (spec 27, 3.7), and gives the email. */
async function newMemberWithPasskey(page: Page): Promise<string> {
  await page.goto("/profile");
  await page.getByRole("button", { name: english.signIn, exact: true }).click();
  const { email } = await enterCodes(page, english, newPhoneNumber());
  await finishSignUp(page, english, "Hekla");
  await expect(page.getByRole("heading", { name: english.fasterTitle })).toBeVisible();
  await page.getByRole("button", { name: "Use Face ID or fingerprint" }).click();
  await expect(
    page.getByText("Face ID or fingerprint is set up on this device.").filter(visible),
  ).toBeVisible();
  return email;
}

async function signOut(page: Page) {
  await menuLink(page, english.profileTab).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: english.findTitle })).toBeVisible();
}

/** Opens step 1 of signing in from Profile, signed out. */
async function openSignIn(page: Page) {
  await menuLink(page, english.profileTab).click();
  await page.getByRole("button", { name: english.signIn, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sign in or create an account" })).toBeVisible();
}

test("a new member sets up Face ID or fingerprint, signs in with it, then removes it", async ({
  page,
}) => {
  const lock = await addDeviceLock(page);
  // The button, as in a browser without the email field's suggestions.
  await withoutSuggestions(page);
  // Straight after sign-up, the fresh sign-in is the proof (spec 27, 3.7).
  const email = await newMemberWithPasskey(page);
  const told = await emailTo(
    email,
    /^Face ID or fingerprint was set up for your PuffinRide account$/,
  );
  expect(told.text).toContain("If that was you, there's nothing to do.");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: english.findTitle })).toBeVisible();

  // Signed out, the device's lock signs in with no email typed (3.3).
  await signOut(page);
  await openSignIn(page);
  await page.getByRole("button", { name: "Face ID or fingerprint", exact: true }).click();
  await expect(page.getByRole("heading", { name: english.findTitle })).toBeVisible();
  await menuLink(page, english.profileTab).click();
  await expect(page.getByText("Hekla", { exact: true }).filter(visible)).toBeVisible();

  // Settings lists the device, used today, and removes it after asking (3.6).
  await page.goto("/settings/sign-in-methods");
  await expect(page.getByText(/^Last used \d{1,2} \w+ \d{4}$/)).toBeVisible();
  await page.getByRole("button", { name: /^Remove Face ID or fingerprint for / }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText(/^Face ID or fingerprint is removed for /)).toBeVisible();
  await expect(page.getByText("Not set up", { exact: true })).toBeVisible();

  // This browser is told, and stops offering it (spec 29, 3.4).
  await expect.poll(() => keptPasskeys(lock)).toBe(0);
});

test("a member signs in from the email field's suggestions, with no tap (spec 29, 3.1)", async ({
  page,
}) => {
  await addDeviceLock(page);
  await newMemberWithPasskey(page);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: english.findTitle })).toBeVisible();
  await signOut(page);

  // Step 1 hands its options to the browser as it opens; the device lock
  // answers as a person picking the passkey from the field would.
  await menuLink(page, english.profileTab).click();
  await page.getByRole("button", { name: english.signIn, exact: true }).click();
  await expect(page.getByRole("heading", { name: english.findTitle })).toBeVisible();
  await menuLink(page, english.profileTab).click();
  await expect(page.getByText("Hekla", { exact: true }).filter(visible)).toBeVisible();
});

test("a passkey the site does not have says so, and the browser forgets it (spec 29, 3.4)", async ({
  page,
}) => {
  const lock = await addDeviceLock(page);
  // A passkey for this site that no member or operator has, as one removed elsewhere.
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  await lock.session.send("WebAuthn.addCredential", {
    authenticatorId: lock.authenticatorId,
    credential: {
      credentialId: randomBytes(16).toString("base64"),
      isResidentCredential: true,
      rpId: "localhost",
      privateKey: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
      userHandle: randomBytes(32).toString("base64"),
      signCount: 0,
    },
  });
  await page.goto("/profile");
  await page.getByRole("button", { name: english.signIn, exact: true }).click();
  await expect(page.getByText(notSetUp)).toBeVisible();
  await expect.poll(() => keptPasskeys(lock)).toBe(0);
  await expect(page.getByRole("heading", { name: "Sign in or create an account" })).toBeVisible();
});
