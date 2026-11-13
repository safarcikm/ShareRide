import { expect, test, type Page } from "@playwright/test";
import { codeIn, newPhoneNumber, sentCount, textMessage } from "./support/sms";

// Journeys from spec 1 (section 9) on the web build, against the test API.

interface Texts {
  readonly continuePhone: string;
  readonly phoneLabel: string;
  readonly send: string;
  readonly codeLabel: string;
  readonly termsTitle: string;
  readonly age: string;
  readonly accept: string;
  readonly acceptButton: string;
  readonly profileTitle: string;
  readonly firstName: string;
  readonly about: string;
  readonly icelandic: string;
  readonly save: string;
  readonly myProfile: string;
}

const english: Texts = {
  continuePhone: "Continue with phone",
  phoneLabel: "Mobile number",
  send: "Send code",
  codeLabel: "6-digit code",
  termsTitle: "Before you start",
  age: "I am 18 or older",
  accept: "I accept the Terms of Service and the Community Rules",
  acceptButton: "Accept and continue",
  profileTitle: "Tell others about you",
  firstName: "First name",
  about: "About you",
  icelandic: "Icelandic",
  save: "Save profile",
  myProfile: "My profile",
};

const icelandic: Texts = {
  continuePhone: "Halda áfram með síma",
  phoneLabel: "Farsímanúmer",
  send: "Senda kóða",
  codeLabel: "6 stafa kóði",
  termsTitle: "Áður en þú byrjar",
  age: "Ég er 18 ára eða eldri",
  accept: "Ég samþykki notendaskilmála og samfélagsreglur",
  acceptButton: "Samþykkja og halda áfram",
  profileTitle: "Segðu frá þér",
  firstName: "Fornafn",
  about: "Um þig",
  icelandic: "Íslenska",
  save: "Vista prófíl",
  myProfile: "Prófíllinn minn",
};

/** Enters the number, reads the code from the text message and enters it. */
async function signIn(page: Page, texts: Texts, phone: { local: string; e164: string }) {
  await page.goto("/");
  await page.getByRole("button", { name: texts.continuePhone }).click();
  await page.getByLabel(texts.phoneLabel).fill(phone.local);
  const sentBefore = sentCount(phone.e164);
  await page.getByRole("button", { name: texts.send }).click();
  const text = await textMessage(phone.e164, sentBefore + 1);
  await page.getByLabel(texts.codeLabel).fill(codeIn(text));
  return text;
}

async function signUp(page: Page, texts: Texts, firstName: string) {
  const phone = newPhoneNumber();
  const text = await signIn(page, texts, phone);
  await expect(page.getByRole("heading", { name: texts.termsTitle })).toBeVisible();
  await page.getByRole("checkbox", { name: texts.age }).click();
  await page.getByRole("checkbox", { name: texts.accept }).click();
  await page.getByRole("button", { name: texts.acceptButton }).click();

  await expect(page.getByRole("heading", { name: texts.profileTitle })).toBeVisible();
  await page.getByLabel(texts.firstName).fill(firstName);
  await page.getByLabel(texts.about).fill("Test account.");
  await page.getByRole("checkbox", { name: texts.icelandic }).click();
  await page.getByRole("button", { name: texts.save }).click();

  await expect(page.getByRole("heading", { name: texts.myProfile })).toBeVisible();
  await expect(page.getByText(firstName, { exact: true })).toBeVisible();
  return { phone, text };
}

test.describe("sign up in English", () => {
  test.use({ locale: "en-GB" });

  test("signs up with a phone number and stays signed in after a reload", async ({ page }) => {
    const { text } = await signUp(page, english, "Anna");
    expect(text).toContain("is your ShareRide code");
    await page.reload();
    await expect(page.getByRole("heading", { name: english.myProfile })).toBeVisible();
  });
});

test.describe("sign up in Icelandic", () => {
  test.use({ locale: "is-IS" });

  test("signs up with the app and the text message in Icelandic", async ({ page }) => {
    const { text } = await signUp(page, icelandic, "Jón");
    expect(text).toContain("er ShareRide kóðinn þinn");
  });
});

test.describe("sign out on all devices", () => {
  test.use({ locale: "en-GB" });

  test("ends the session on the other device too", async ({ browser, page }) => {
    const { phone } = await signUp(page, english, "Sigga");

    const otherDevice = await browser.newContext({ locale: "en-GB" });
    const other = await otherDevice.newPage();
    await signIn(other, english, phone);
    await expect(other.getByRole("heading", { name: english.myProfile })).toBeVisible();

    await other.getByRole("button", { name: "Settings" }).click();
    await other.getByRole("button", { name: "Sign out on all devices" }).click();
    await expect(other.getByRole("button", { name: english.continuePhone })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: english.continuePhone })).toBeVisible();
    await otherDevice.close();
  });
});
