import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { emailedCode, signInCodeSubject } from "./email";
import { codeIn, newPhoneNumber, sentCount, textMessage } from "./sms";

// Signing up and in through the app, as in spec 26's journeys, for any
// journey that needs an account: an email and the code emailed to it, and
// for a new person the phone number, texted a code once.

export interface Texts {
  /** "Sign in" on Profile in the menu, signed out. */
  readonly signIn: string;
  /** Find's title, where the app opens, for someone signed out. */
  readonly findTitle: string;
  /** Find's title for someone signed in, who is greeted by name (spec 31, 3.5). */
  readonly hi: (firstName: string) => string;
  /** Find and Profile in the menu. */
  readonly findTab: string;
  readonly profileTab: string;
  /** Step 1's email field (spec 26, 3.1). */
  readonly email: string;
  /** "Send code", under the email and under the number alike. */
  readonly send: string;
  readonly codeLabel: string;
  /** Step 2: the phone number, for a new person only (spec 26, 3.3). */
  readonly phoneTitle: string;
  readonly phoneLabel: string;
  /** Step 3 of signing up, about you, with the terms (spec 16, 3.5). */
  readonly aboutYouTitle: string;
  readonly firstName: string;
  readonly addAbout: string;
  readonly about: string;
  readonly age: string;
  readonly accept: string;
  /** Step 3's button when nothing is kept through signing up. */
  readonly createAccount: string;
  /** Once after step 3, with nothing kept (spec 27, 3.7). */
  readonly fasterTitle: string;
  readonly notNow: string;
  readonly myProfile: string;
}

export const english: Texts = {
  signIn: "Sign in",
  findTitle: "Share your ride",
  hi: (firstName) => `Hi ${firstName}`,
  findTab: "Find",
  profileTab: "Profile",
  email: "Email",
  send: "Send code",
  codeLabel: "6-digit code",
  phoneTitle: "Add your phone number",
  phoneLabel: "Mobile number",
  aboutYouTitle: "Last step: about you",
  firstName: "First name",
  addAbout: "Add a few words about you (optional)",
  about: "About you",
  age: "I am 18 or older",
  accept: "I accept the Terms of Service and the Community Rules",
  createAccount: "Create account",
  fasterTitle: "Sign in faster next time",
  notNow: "Not now",
  myProfile: "My profile",
};

export const icelandic: Texts = {
  signIn: "Skrá inn",
  findTitle: "Verum samferða",
  hi: (firstName) => `Hæ ${firstName}`,
  findTab: "Leita",
  profileTab: "Prófíll",
  email: "Netfang",
  send: "Senda kóða",
  codeLabel: "6 stafa kóði",
  phoneTitle: "Bættu við símanúmerinu þínu",
  phoneLabel: "Farsímanúmer",
  aboutYouTitle: "Síðasta skref: um þig",
  firstName: "Fornafn",
  addAbout: "Bættu við nokkrum orðum um þig (valfrjálst)",
  about: "Um þig",
  age: "Ég er 18 ára eða eldri",
  accept: "Ég samþykki notendaskilmála og samfélagsreglur",
  createAccount: "Stofna aðgang",
  fasterTitle: "Skráðu þig hraðar inn næst",
  notNow: "Ekki núna",
  myProfile: "Prófíllinn minn",
};

/** A new address for a new account. The test database is new each run. */
export function newEmail(): string {
  return `test-${randomUUID().slice(0, 8)}@example.com`;
}

/** Opens sign-in from Profile and signs in to an account with its email's code. */
export async function signIn(page: Page, texts: Texts, address: string) {
  await page.goto("/profile");
  await page.getByRole("button", { name: texts.signIn, exact: true }).click();
  await enterEmailCode(page, texts, address);
}

/** Step 1 on the sign-in screen: the email, then the code from the email. */
export async function enterEmailCode(page: Page, texts: Texts, address: string) {
  await page.getByLabel(texts.email, { exact: true }).fill(address);
  const code = await emailedCode(address, signInCodeSubject, () =>
    page.getByRole("button", { name: texts.send, exact: true }).click(),
  );
  await page.getByLabel(texts.codeLabel).fill(code);
}

/**
 * Step 2, after an email or a Google account no account has: the number,
 * then the code from the text message. Gives the text message.
 */
export async function enterPhoneCode(
  page: Page,
  texts: Texts,
  phone: { local: string; e164: string },
) {
  await expect(page.getByRole("heading", { name: texts.phoneTitle })).toBeVisible();
  await page.getByLabel(texts.phoneLabel).fill(phone.local);
  const sentBefore = sentCount(phone.e164);
  await page.getByRole("button", { name: texts.send, exact: true }).click();
  const text = await textMessage(phone.e164, sentBefore + 1);
  await page.getByLabel(texts.codeLabel).fill(codeIn(text));
  return text;
}

/**
 * Steps 1 and 2 for a new person on the sign-in screen: a new email and
 * its code, then the number and the code texted to it. Gives the email
 * and the text message.
 */
export async function enterCodes(page: Page, texts: Texts, phone: { local: string; e164: string }) {
  const email = newEmail();
  await enterEmailCode(page, texts, email);
  const text = await enterPhoneCode(page, texts, phone);
  return { email, text };
}

/**
 * Signs up a new person through the three steps, which opens Find, then
 * checks the profile under Profile in the menu and goes back to Find. Gives
 * the number, the text message with its code and the account's email,
 * proven by its code.
 */
export async function signUp(page: Page, texts: Texts, firstName: string) {
  const phone = newPhoneNumber();
  await page.goto("/profile");
  await page.getByRole("button", { name: texts.signIn, exact: true }).click();
  const { email, text } = await enterCodes(page, texts, phone);
  await finishSignUp(page, texts, firstName);
  await notNow(page, texts);
  await expect(page.getByRole("heading", { name: texts.hi(firstName) })).toBeVisible();
  await menuLink(page, texts.profileTab).click();
  await expect(page.getByRole("heading", { name: texts.myProfile })).toBeVisible();
  // Other places of the menu stay in the page, out of sight.
  await expect(page.getByText(firstName, { exact: true }).filter({ visible: true })).toBeVisible();
  await menuLink(page, texts.findTab).click();
  await expect(page.getByRole("heading", { name: texts.hi(firstName) })).toBeVisible();
  // Back to Find goes back in the browser's history, which moves the address
  // a moment after the screen. A reload before then opens My profile again.
  await expect(page).toHaveURL("/");
  return { phone, text, email };
}

/**
 * After step 3 with nothing kept, "Sign in faster next time" shows once
 * (spec 27, 3.7): "Not now" goes on to Find.
 */
export async function notNow(page: Page, texts: Texts) {
  await expect(page.getByRole("heading", { name: texts.fasterTitle })).toBeVisible();
  await page.getByRole("button", { name: texts.notNow, exact: true }).click();
}

/** A place of the menu: the tab bar on phones, the top bar on wide screens. */
export function menuLink(page: Page, name: string) {
  return page.getByRole("navigation").getByRole("link", { name, exact: true });
}

/**
 * After the codes, step 3: a new person gives a first name and a few
 * words, keeps the app's language ticked, accepts the terms and presses
 * the button, which names what comes next ("Create account" when nothing
 * is kept). The account has its email already, so no email is asked.
 */
export async function finishSignUp(
  page: Page,
  texts: Texts,
  firstName: string,
  button = texts.createAccount,
) {
  await expect(page.getByRole("heading", { name: texts.aboutYouTitle })).toBeVisible();
  await page.getByLabel(texts.firstName).fill(firstName);
  await page.getByRole("button", { name: texts.addAbout }).click();
  await page.getByLabel(texts.about).fill("Test account.");
  await page.getByRole("checkbox", { name: texts.age }).click();
  await page.getByRole("checkbox", { name: texts.accept }).click();
  await page.getByRole("button", { name: button, exact: true }).click();
}
