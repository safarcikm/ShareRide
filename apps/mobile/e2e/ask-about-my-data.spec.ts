import { expect, test } from "@playwright/test";
import { english, signUp } from "./support/account";
import { confirmEmail } from "./support/email";

// Ask about my data (spec 11, 3.6) on the web build: someone without a
// confirmed email is asked to add one first, since the answer goes by
// email. Email shows the link sent at sign-up waiting (spec 20, 3.3); with
// it opened, they send a question from Privacy and are told it is answered
// within a month. The address is new each run and project.

test.use({ locale: "en-GB" });

test("asks about my data, adding an email first", async ({ page }) => {
  test.setTimeout(120_000);
  const visible = { visible: true } as const;
  const { email: address } = await signUp(page, english, "Rósa");
  await page.goto("/settings");
  await page.getByRole("button", { name: "Privacy and your data" }).click();
  await page.getByRole("button", { name: "Ask about my data" }).click();
  await expect(page.getByRole("heading", { name: "Ask about my data" })).toBeVisible();
  await expect(
    page.getByText("We answer by email, so add your email first.").filter(visible),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add my email" }).click();
  await expect(page).toHaveURL("/settings/email");
  await expect(
    page
      .getByText(`We sent a link to ${address}. Open it within 24 hours to add the address.`)
      .filter(visible),
  ).toBeVisible();
  await confirmEmail(page, address);

  await page.goto("/settings/privacy/ask");
  await expect(page.getByText(`We answer at ${address}.`).filter(visible)).toBeVisible();
  await page.getByRole("radio", { name: /^Ask a question/ }).click();
  await page.getByLabel("Your message").fill("How long do you keep my trips?");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  await expect(
    page.getByText("Thank you. We'll answer by email within a month.").filter(visible),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to Privacy" }).click();
  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
});
