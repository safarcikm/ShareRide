import { expect, test } from "@playwright/test";
import { english, icelandic, menuLink, signIn, signUp } from "./support/account";

// Journeys from spec 1 (section 9) on the web build, against the test API.

test.describe("sign up in English", () => {
  test.use({ locale: "en-GB" });

  test("signs up with a phone number and stays signed in after a reload", async ({ page }) => {
    const { text } = await signUp(page, english, "Anna");
    expect(text).toContain("is your PuffinRide code");
    await page.reload();
    await expect(page.getByRole("heading", { name: english.findTitle })).toBeVisible();
    await menuLink(page, english.profileTab).click();
    await expect(page.getByRole("heading", { name: english.myProfile })).toBeVisible();
  });
});

test.describe("sign up in Icelandic", () => {
  test.use({ locale: "is-IS" });

  test("signs up with the app and the text message in Icelandic", async ({ page }) => {
    const { text } = await signUp(page, icelandic, "Jón");
    expect(text).toContain("er PuffinRide-kóðinn þinn");
  });
});

test.describe("sign out on all devices", () => {
  test.use({ locale: "en-GB" });

  test("ends the session on the other device too", async ({ browser, page }) => {
    const { phone } = await signUp(page, english, "Sigga");

    const otherDevice = await browser.newContext({ locale: "en-GB" });
    const other = await otherDevice.newPage();
    await signIn(other, english, phone);
    // Signing in leads to Find, with the menu as it was.
    await expect(other.getByRole("heading", { name: english.findTitle })).toBeVisible();
    await menuLink(other, english.profileTab).click();
    await expect(other.getByRole("heading", { name: english.myProfile })).toBeVisible();

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
