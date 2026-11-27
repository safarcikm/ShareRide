import { expect, test, type Page } from "@playwright/test";
import { english, enterCodes, finishSignUp, menuLink } from "./support/account";
import { emailedCode, emailTo, signInCodeSubject } from "./support/email";
import { newPhoneNumber } from "./support/sms";

// Spec 27's password journeys (section 8) on the web build, against the
// test API: a new member adds a password straight after signing up and
// signs in with it; a forgotten one is chosen again after the email code.

test.use({ locale: "en-GB" });

const visible = { visible: true } as const;

/** Signs up a new person, who gets "Sign in faster next time" once. Gives the email. */
async function signUpToFaster(page: Page, firstName: string): Promise<string> {
  await page.goto("/profile");
  await page.getByRole("button", { name: english.signIn, exact: true }).click();
  const { email } = await enterCodes(page, english, newPhoneNumber());
  await finishSignUp(page, english, firstName);
  await expect(page.getByRole("heading", { name: english.fasterTitle })).toBeVisible();
  return email;
}

/** On Choose a password: types it once, saves it, and is told; Find then greets by name. */
async function choosePassword(page: Page, password: string, firstName: string) {
  await expect(page.getByRole("heading", { name: "Choose a password" })).toBeVisible();
  await page.getByLabel("New password").fill(password);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByText("Your password is saved.").filter(visible)).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("heading", { name: english.hi(firstName) })).toBeVisible();
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

test("a new member adds a password after signing up, then signs in with it", async ({ page }) => {
  const email = await signUpToFaster(page, "Birta");
  await page.getByRole("button", { name: "Add a password" }).click();
  await choosePassword(page, "puffins fly north in May", "Birta");
  const told = await emailTo(email, /^A password was added to your PuffinRide account$/);
  expect(told.text).toContain("If that was you, there's nothing to do.");

  await signOut(page);
  await openSignIn(page);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("not the password at all");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText(
      "Wrong email or password. Check them, or leave the password empty and we'll email you a code.",
    ),
  ).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill("puffins fly north in May");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: english.hi("Birta") })).toBeVisible();
  await menuLink(page, english.profileTab).click();
  await expect(page.getByText("Birta", { exact: true }).filter(visible)).toBeVisible();

  // Sign-in methods says it is set, and removes it.
  await page.goto("/settings/sign-in-methods");
  await expect(page.getByText(/^Set on \d{1,2} \w+ \d{4}$/)).toBeVisible();
  await page.getByRole("button", { name: "Remove password" }).click();
  await page.getByRole("button", { name: "Remove password" }).click();
  await expect(page.getByText("Your password is removed.")).toBeVisible();
  await expect(page.getByText("Not set", { exact: true })).toBeVisible();
});

test("a forgotten password is chosen again after the email code", async ({ page }) => {
  const email = await signUpToFaster(page, "Dagný");
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByRole("heading", { name: english.hi("Dagný") })).toBeVisible();

  await signOut(page);
  await openSignIn(page);
  await page.getByLabel("Email", { exact: true }).fill(email);
  const code = await emailedCode(email, signInCodeSubject, () =>
    page.getByRole("button", { name: "Forgot your password?" }).click(),
  );
  await page.getByLabel(english.codeLabel).fill(code);
  await choosePassword(page, "kaffi og kleinur á sunnudögum", "Dagný");

  await signOut(page);
  await openSignIn(page);
  await page.getByLabel("Email", { exact: true }).fill(email.toUpperCase());
  await page.getByLabel("Password", { exact: true }).fill("kaffi og kleinur á sunnudögum");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: english.hi("Dagný") })).toBeVisible();
});
