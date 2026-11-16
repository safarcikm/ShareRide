import { expect, type Page } from "@playwright/test";
import { codeIn, newPhoneNumber, sentCount, textMessage } from "./sms";

// Signing up and in through the app, as in spec 1's journeys, for any
// journey that needs an account.

export interface Texts {
  /** "Sign in" on Profile in the menu, signed out. */
  readonly signIn: string;
  /** Find's title, where the app opens. */
  readonly findTitle: string;
  /** Find and Profile in the menu. */
  readonly findTab: string;
  readonly profileTab: string;
  readonly phoneLabel: string;
  readonly send: string;
  readonly codeLabel: string;
  /** Step 3 of signing up, about you, with the terms (spec 16, 3.5). */
  readonly aboutYouTitle: string;
  readonly firstName: string;
  readonly addAbout: string;
  readonly about: string;
  readonly age: string;
  readonly accept: string;
  /** Step 3's button when nothing is kept through signing up. */
  readonly createAccount: string;
  readonly myProfile: string;
}

export const english: Texts = {
  signIn: "Sign in",
  findTitle: "Where are you going?",
  findTab: "Find",
  profileTab: "Profile",
  phoneLabel: "Mobile number",
  send: "Send code",
  codeLabel: "6-digit code",
  aboutYouTitle: "Last step: about you",
  firstName: "First name",
  addAbout: "Add a few words about you (optional)",
  about: "About you",
  age: "I am 18 or older",
  accept: "I accept the Terms of Service and the Community Rules",
  createAccount: "Create account",
  myProfile: "My profile",
};

export const icelandic: Texts = {
  signIn: "Skrá inn",
  findTitle: "Hvert ertu að fara?",
  findTab: "Leita",
  profileTab: "Prófíll",
  phoneLabel: "Farsímanúmer",
  send: "Senda kóða",
  codeLabel: "6 stafa kóði",
  aboutYouTitle: "Síðasta skref: um þig",
  firstName: "Fornafn",
  addAbout: "Bættu við nokkrum orðum um þig (valfrjálst)",
  about: "Um þig",
  age: "Ég er 18 ára eða eldri",
  accept: "Ég samþykki notendaskilmála og samfélagsreglur",
  createAccount: "Stofna aðgang",
  myProfile: "Prófíllinn minn",
};

/** Enters the number, reads the code from the text message and enters it. */
export async function signIn(page: Page, texts: Texts, phone: { local: string; e164: string }) {
  await page.goto("/profile");
  await page.getByRole("button", { name: texts.signIn, exact: true }).click();
  return enterCode(page, texts, phone);
}

/** On the sign-in screen: the number, then the code from the text message. */
export async function enterCode(page: Page, texts: Texts, phone: { local: string; e164: string }) {
  await page.getByLabel(texts.phoneLabel).fill(phone.local);
  const sentBefore = sentCount(phone.e164);
  await page.getByRole("button", { name: texts.send }).click();
  const text = await textMessage(phone.e164, sentBefore + 1);
  await page.getByLabel(texts.codeLabel).fill(codeIn(text));
  return text;
}

/**
 * Signs up a new person through the three steps, which opens Find, then
 * checks the profile under Profile in the menu and goes back to Find.
 */
export async function signUp(page: Page, texts: Texts, firstName: string) {
  const phone = newPhoneNumber();
  const text = await signIn(page, texts, phone);
  await finishSignUp(page, texts, firstName);
  await expect(page.getByRole("heading", { name: texts.findTitle })).toBeVisible();
  await menuLink(page, texts.profileTab).click();
  await expect(page.getByRole("heading", { name: texts.myProfile })).toBeVisible();
  // Other places of the menu stay in the page, out of sight.
  await expect(page.getByText(firstName, { exact: true }).filter({ visible: true })).toBeVisible();
  await menuLink(page, texts.findTab).click();
  await expect(page.getByRole("heading", { name: texts.findTitle })).toBeVisible();
  // Back to Find goes back in the browser's history, which moves the address
  // a moment after the screen. A reload before then opens My profile again.
  await expect(page).toHaveURL("/");
  return { phone, text };
}

/** A place of the menu: the tab bar on phones, the top bar on wide screens. */
export function menuLink(page: Page, name: string) {
  return page.getByRole("navigation").getByRole("link", { name, exact: true });
}

/**
 * After the code, step 3: a new person gives a first name and a few words,
 * keeps the app's language ticked, accepts the terms and presses the button,
 * which names what comes next ("Create account" when nothing is kept).
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
