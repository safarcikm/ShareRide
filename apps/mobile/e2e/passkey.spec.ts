import { expect, test, type Page } from "@playwright/test";
import { english, enterCodes, finishSignUp, menuLink } from "./support/account";
import { emailTo } from "./support/email";
import { newPhoneNumber } from "./support/sms";

// Spec 27's Face ID or fingerprint journey (section 8) on the web build,
// against the test API. Chromium's virtual authenticator stands in for the
// device's own lock: built in ("internal"), keeping the passkey, and
// checking the person (user verification), as Face ID or a fingerprint does.

test.use({ locale: "en-GB" });

const visible = { visible: true } as const;

/** Gives this page a device lock that answers at once, before the app asks for one. */
async function addDeviceLock(page: Page) {
  const session = await page.context().newCDPSession(page);
  await session.send("WebAuthn.enable");
  await session.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
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
  await addDeviceLock(page);
  await page.goto("/profile");
  await page.getByRole("button", { name: english.signIn, exact: true }).click();
  const { email } = await enterCodes(page, english, newPhoneNumber());
  await finishSignUp(page, english, "Hekla");
  await expect(page.getByRole("heading", { name: english.fasterTitle })).toBeVisible();

  // Straight after sign-up, the fresh sign-in is the proof (spec 27, 3.7).
  await page.getByRole("button", { name: "Use Face ID or fingerprint" }).click();
  await expect(
    page.getByText("Face ID or fingerprint is set up on this device.").filter(visible),
  ).toBeVisible();
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

  // The passkey may stay on the device; it no longer signs in (3.6, item 5).
  // On a phone, Settings opened by its address has no tab bar.
  await page.goto("/profile");
  await signOut(page);
  await openSignIn(page);
  await page.getByRole("button", { name: "Face ID or fingerprint", exact: true }).click();
  await expect(
    page.getByText(
      "This device's sign-in isn't set up for your PuffinRide account. Use your email, then set it up again in Settings.",
    ),
  ).toBeVisible();
});
