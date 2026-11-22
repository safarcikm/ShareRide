import { expect, test, type Page } from "@playwright/test";
import { english, enterCode, menuLink, signUp } from "./support/account";
import { codeIn, newPhoneNumber, sentCount, textMessage } from "./support/sms";

// Spec 19's journeys (section 9) with the development stand-in for Google
// (ADR 0034): its page opens in a pop-up, as Google's would, and comes back
// to the web app's sign-in/return.

/**
 * Each project gets its own stand-in person, so the phone and the laptop
 * runs never meet in the test database: the same person twice would be
 * known the second time.
 */
const personOf = (project: string) =>
  project === "phone"
    ? { label: "Anna, with a verified email", firstName: "Anna", email: "dev-person-1@example.com" }
    : {
        label: "Bjarni, who hid his email",
        firstName: "Bjarni",
        email: "dev-person-2@privaterelay.example",
      };

/** Presses "Continue with Google" and picks the person on the stand-in's page. */
async function continueWithGoogle(page: Page, person: string) {
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  const window = await popup;
  await window.getByRole("link", { name: person }).click();
  // The web app hands the answer to this page, which closes the pop-up.
  await window.waitForEvent("close");
}

test.describe("Continue with Google", () => {
  test.use({ locale: "en-GB" });

  test("a newcomer adds a phone number, then is a member Google signs in", async ({
    page,
  }, testInfo) => {
    const person = personOf(testInfo.project.name);
    await page.goto("/profile");
    await page.getByRole("button", { name: english.signIn, exact: true }).click();
    await continueWithGoogle(page, person.label);

    await expect(page.getByRole("heading", { name: "Add your phone number" })).toBeVisible();
    await expect(
      page.getByText(`You signed in with Google as ${person.email}.`, { exact: false }),
    ).toBeVisible();
    // The ticket never stays in the address, here or in the pop-up.
    expect(page.url()).not.toContain("sr_");
    await enterCode(page, english, newPhoneNumber());

    // Step 3 opens with the first name Google gave.
    await expect(page.getByRole("heading", { name: english.aboutYouTitle })).toBeVisible();
    await expect(page.getByLabel(english.firstName)).toHaveValue(person.firstName);
    await page.getByRole("checkbox", { name: english.age }).click();
    await page.getByRole("checkbox", { name: english.accept }).click();
    await page.getByRole("button", { name: english.createAccount, exact: true }).click();
    await expect(page.getByRole("heading", { name: english.findTitle })).toBeVisible();

    // Signed out, Google alone signs the member in again: no code.
    await menuLink(page, english.profileTab).click();
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("heading", { name: english.findTitle })).toBeVisible();
    await menuLink(page, english.profileTab).click();
    await page.getByRole("button", { name: english.signIn, exact: true }).click();
    await continueWithGoogle(page, person.label);
    await expect(page.getByRole("heading", { name: english.findTitle })).toBeVisible();
    await menuLink(page, english.profileTab).click();
    await expect(page.getByRole("heading", { name: english.myProfile })).toBeVisible();
    await expect(
      page.getByText(person.firstName, { exact: true }).filter({ visible: true }),
    ).toBeVisible();
  });

  test("closing the pop-up leaves the sign-in screen as it was", async ({ page }) => {
    await page.goto("/sign-in");
    const popup = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await (await popup).close();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
    await expect(page.getByRole("heading", { name: "Sign in or create an account" })).toBeVisible();
    await expect(page.getByTestId("notice")).toHaveCount(0);
  });

  test("leaving sign-in closes its pop-up", async ({ page }) => {
    await page.goto("/profile");
    await page.getByRole("button", { name: english.signIn, exact: true }).click();
    const popup = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    const window = await popup;
    const closed = window.waitForEvent("close");
    await page.goBack();
    await closed;
  });

  test("a pop-up nothing waits for says it can be closed, and keeps no ticket", async ({
    page,
  }, testInfo) => {
    const person = personOf(testInfo.project.name);
    await page.goto("/sign-in");
    const popup = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    const window = await popup;
    // The page underneath reloads, so nothing there waits for the answer.
    await page.reload();
    await window.getByRole("link", { name: person.label }).click();
    await expect(window.getByRole("heading", { name: "You can close this window" })).toBeVisible();
    expect(window.url()).toMatch(/\/sign-in\/return$/);
    expect(
      await window.evaluate(() => `${location.href} ${JSON.stringify(history.state)}`),
    ).not.toContain("sr_");
  });
});

test.describe("Sign-in methods in Settings", () => {
  test.use({ locale: "en-GB" });

  test("adds Apple with a confirm code, then removes it", async ({ page }, testInfo) => {
    // Apple's stand-in people, so no Google journey meets them. The
    // stand-in's relay-style address is not Apple's own relay domain, so the
    // row shows it as it is; "Email hidden by Apple" has its screen test.
    const person = personOf(testInfo.project.name);
    const { phone } = await signUp(page, english, "Gunna");
    await page.goto("/settings");
    await page.getByRole("button", { name: "Sign-in methods" }).click();
    await expect(page.getByRole("heading", { name: "Sign-in methods" })).toBeVisible();
    await expect(page.getByText("Not linked")).toHaveCount(2);

    const sentBefore = sentCount(phone.e164);
    const popup = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Add Apple" }).click();
    const window = await popup;
    // Apple posts its answer back as a form.
    await window.getByRole("button", { name: person.label }).click();
    await window.waitForEvent("close");

    await expect(page.getByText("To add Apple, enter the code we text you.")).toBeVisible();
    const text = await textMessage(phone.e164, sentBefore + 1);
    await page.getByLabel("6-digit code").fill(codeIn(text));
    await expect(
      page.getByText("Apple is now linked to your account. Next time you can continue with Apple."),
    ).toBeVisible();
    await expect(page.getByText(person.email, { exact: true })).toBeVisible();
    await expect(page.getByText("Not linked")).toHaveCount(1);

    await page.getByRole("button", { name: "Remove Apple" }).click();
    await expect(
      page.getByText("Remove Apple? You can still sign in with your phone number."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Remove Apple" }).click();
    await expect(page.getByText("Apple is no longer linked to your account.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Apple" })).toBeVisible();
  });
});
