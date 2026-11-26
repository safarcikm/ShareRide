import { generateKeyPairSync, randomBytes } from "node:crypto";
import { expect, test, type CDPSession, type Locator, type Page } from "@playwright/test";
import { english, enterCodes, finishSignUp, menuLink, signIn, signUp } from "./support/account";
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
const offerTitle = "Use Face ID or fingerprint next time?";
const notSetUp =
  "This device's sign-in isn't set up for your PuffinRide account. Use your email, then set it up again in Profile, under Sign-in methods.";

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

/** How far down the page a control starts. */
async function top(control: Locator): Promise<number> {
  return (await control.boundingBox())?.y ?? Number.NaN;
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
  await expect(page.getByRole("heading", { name: english.hi("Hekla") })).toBeVisible();

  // Signed out, the device's lock signs in with no email typed (3.3).
  await signOut(page);
  await openSignIn(page);
  await page.getByRole("button", { name: "Face ID or fingerprint", exact: true }).click();
  await expect(page.getByRole("heading", { name: english.hi("Hekla") })).toBeVisible();
  await menuLink(page, english.profileTab).click();
  await expect(page.getByText("Hekla", { exact: true }).filter(visible)).toBeVisible();

  // Sign-in methods lists the device, used today, and removes it after asking (3.6).
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
  await expect(page.getByRole("heading", { name: english.hi("Hekla") })).toBeVisible();
  await signOut(page);

  // Step 1 hands its options to the browser as it opens; the device lock
  // answers as a person picking the passkey from the field would.
  await menuLink(page, english.profileTab).click();
  await page.getByRole("button", { name: english.signIn, exact: true }).click();
  await expect(page.getByRole("heading", { name: english.hi("Hekla") })).toBeVisible();
  await menuLink(page, english.profileTab).click();
  await expect(page.getByText("Hekla", { exact: true }).filter(visible)).toBeVisible();
});

test("a member who signs in with the email code is offered Face ID, and uses it next time (spec 29, 3.2)", async ({
  page,
}) => {
  await addDeviceLock(page);
  await withoutSuggestions(page);
  // An account from before, which said "Not now" to Face ID at sign-up.
  const { email } = await signUp(page, english, "Hekla");
  await signOut(page);

  // Back with the email code: asked once, and set up with the fresh sign-in.
  await signIn(page, english, email);
  await expect(page.getByRole("heading", { name: offerTitle })).toBeVisible();
  await page.getByRole("button", { name: "Set it up", exact: true }).click();
  await expect(
    page.getByText("Face ID or fingerprint is set up on this device.").filter(visible),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: english.hi("Hekla") })).toBeVisible();

  // Next time the device's lock signs in, and nothing is offered.
  await signOut(page);
  await openSignIn(page);
  await page.getByRole("button", { name: "Face ID or fingerprint", exact: true }).click();
  await expect(page.getByRole("heading", { name: english.hi("Hekla") })).toBeVisible();
  await expect(page.getByRole("heading", { name: offerTitle })).toHaveCount(0);

  // The time after, step 1 shows it first, marked (spec 29, 3.5).
  await signOut(page);
  await openSignIn(page);
  const lastUsed = page.getByText("Last used", { exact: true }).filter(visible);
  const faceId = page.getByRole("button", { name: "Face ID or fingerprint", exact: true });
  await expect(lastUsed).toBeVisible();
  expect(await top(lastUsed)).toBeLessThan(await top(faceId));
  expect(await top(faceId)).toBeLessThan(await top(page.getByLabel("Email").filter(visible)));
  await faceId.click();
  await expect(page.getByRole("heading", { name: english.findTitle })).toBeVisible();
});

test("after a password, a browser that saves no passkey by itself offers Face ID (spec 29, 3.3)", async ({
  page,
}) => {
  const lock = await addDeviceLock(page);
  await withoutSuggestions(page);
  await page.goto("/profile");
  await page.getByRole("button", { name: english.signIn, exact: true }).click();
  const { email } = await enterCodes(page, english, newPhoneNumber());
  await finishSignUp(page, english, "Hekla");
  await page.getByRole("button", { name: "Add a password" }).click();
  await page.getByLabel("New password").fill("puffins fly north in May");
  await page.getByRole("button", { name: "Save password" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: english.hi("Hekla") })).toBeVisible();
  await signOut(page);

  // Chromium, with no password of its own saved, never decides: the app
  // stops asking after a few seconds and offers Face ID instead.
  await openSignIn(page);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("puffins fly north in May");
  const quiet = page.waitForRequest(
    (request) =>
      request.url().endsWith("/v1/me/passkeys/options") &&
      (request.postDataJSON() as { quiet?: boolean } | null)?.quiet === true,
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await quiet;
  await expect(page.getByRole("heading", { name: offerTitle })).toBeVisible({ timeout: 10_000 });
  expect(await keptPasskeys(lock)).toBe(0);
  await page.getByRole("button", { name: "Set it up", exact: true }).click();
  await expect(
    page.getByText("Face ID or fingerprint is set up on this device.").filter(visible),
  ).toBeVisible();
  expect(await keptPasskeys(lock)).toBe(1);
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
