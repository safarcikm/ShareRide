import { expect, test } from "@playwright/test";
import {
  english,
  enterEmailCode,
  enterPhoneCode,
  icelandic,
  menuLink,
  newEmail,
  signIn,
  signUp,
} from "./support/account";
import { emailTo } from "./support/email";
import { sentCount } from "./support/sms";

// Journeys from spec 1 (section 9) and spec 26 (section 9) on the web
// build, against the test API: an email's code signs in, and a text goes
// only to a new number, once.

test.describe("sign up in English", () => {
  test.use({ locale: "en-GB" });

  test("signs up with an email and a phone number and stays signed in after a reload", async ({
    page,
  }) => {
    const { text } = await signUp(page, english, "Anna");
    expect(text).toContain("is your PuffinRide code");
    await page.reload();
    await expect(page.getByRole("heading", { name: english.hi("Anna") })).toBeVisible();
    await menuLink(page, english.profileTab).click();
    await expect(page.getByRole("heading", { name: english.myProfile })).toBeVisible();
  });
});

test.describe("sign up in Icelandic", () => {
  test.use({ locale: "is-IS" });

  test("signs up with the app, the email and the text message in Icelandic", async ({ page }) => {
    const { text } = await signUp(page, icelandic, "Jón");
    expect(text).toContain("er PuffinRide-kóðinn þinn");
  });
});

test.describe("sign out on all devices", () => {
  test.use({ locale: "en-GB" });

  test("ends the session on the other device too", async ({ browser, page }) => {
    const { phone, email } = await signUp(page, english, "Sigga");

    // The email's code alone signs her in on another device: no text message.
    const otherDevice = await browser.newContext({ locale: "en-GB" });
    const other = await otherDevice.newPage();
    await signIn(other, english, email);
    // Signing in leads to Find, which greets her, with the menu as it was.
    await expect(other.getByRole("heading", { name: english.hi("Sigga") })).toBeVisible();
    await menuLink(other, english.profileTab).click();
    await expect(other.getByRole("heading", { name: english.myProfile })).toBeVisible();
    expect(sentCount(phone.e164)).toBe(1);

    await other.getByRole("button", { name: "Settings" }).click();
    await other.getByRole("button", { name: "Sign out on all devices" }).click();
    await expect(other.getByRole("heading", { name: english.findTitle })).toBeVisible();
    await menuLink(other, english.profileTab).click();
    await expect(other.getByRole("button", { name: english.signIn, exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: english.findTitle })).toBeVisible();
    await menuLink(page, english.profileTab).click();
    await expect(page.getByRole("button", { name: english.signIn, exact: true })).toBeVisible();
    await otherDevice.close();
  });
});

test.describe("sign out from Profile", () => {
  test.use({ locale: "en-GB" });

  test("signs out of this device from Profile, and stays signed out after a reload", async ({
    page,
  }) => {
    await signUp(page, english, "Gunna");
    await menuLink(page, english.profileTab).click();
    await expect(page.getByRole("heading", { name: english.myProfile })).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("heading", { name: english.findTitle })).toBeVisible();
    await page.reload();
    await menuLink(page, english.profileTab).click();
    await expect(page.getByRole("button", { name: english.signIn, exact: true })).toBeVisible();
  });
});

test.describe("a lost email", () => {
  test.use({ locale: "en-GB" });

  test("gets a member in with a new email and their number, and tells the old address", async ({
    browser,
    page,
  }) => {
    const { phone, email: lost } = await signUp(page, english, "Lára");

    // On another device, a new email, then her number: her account, with the new email.
    const otherDevice = await browser.newContext({ locale: "en-GB" });
    const other = await otherDevice.newPage();
    const address = newEmail();
    await other.goto("/profile");
    await other.getByRole("button", { name: english.signIn, exact: true }).click();
    await enterEmailCode(other, english, address);
    await enterPhoneCode(other, english, phone);
    await expect(other.getByText(`Your sign-in email is now ${address}.`)).toBeVisible();
    await other.getByRole("button", { name: "Close the message" }).click();
    await menuLink(other, english.profileTab).click();
    await expect(other.getByText("Lára", { exact: true }).filter({ visible: true })).toBeVisible();
    expect(sentCount(phone.e164)).toBe(2);

    // The address she lost is told, in case it was not her, with the new one partly hidden.
    const told = await emailTo(lost, /^Your PuffinRide sign-in email changed$/);
    expect(told.text).toContain(`now signs in with ${address.slice(0, 2)}•••@example.com.`);
    await otherDevice.close();
  });
});
