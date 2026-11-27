import { expect, test } from "@playwright/test";
import { english, signUp } from "./support/account";

// Ask about my data (spec 11, 3.6) on the web build: the answer goes by
// email, to the address the account signs in with (spec 26), so a new
// member is never asked to add one first; a member from before without an
// email is, in the screen's own test. They send a question from Privacy
// and are told it is answered within a month.

test.use({ locale: "en-GB" });

test("asks about my data, answered at the account's email", async ({ page }) => {
  const visible = { visible: true } as const;
  const { email: address } = await signUp(page, english, "Rósa");
  await page.goto("/profile");
  await page.getByRole("link", { name: "Privacy and your data" }).click();
  await page.getByRole("button", { name: "Ask about my data" }).click();
  await expect(page.getByRole("heading", { name: "Ask about my data" })).toBeVisible();
  await expect(page.getByText(`We answer at ${address}.`).filter(visible)).toBeVisible();
  await page.getByRole("radio", { name: /^Ask a question/ }).click();
  await page.getByLabel("Your message").fill("How long do you keep my rides?");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  await expect(
    page.getByText("Thank you. We'll answer by email within a month.").filter(visible),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to Privacy" }).click();
  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
});
