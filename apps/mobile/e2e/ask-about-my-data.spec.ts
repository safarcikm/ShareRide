import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { english, signUp } from "./support/account";
import { emailTo, linkIn } from "./support/email";

// Ask about my data (spec 11, 3.6) on the web build: someone without an
// email is asked to add one first, since the answer goes by email; with it
// added, they send a question from Privacy and are told it is answered
// within a month. The address is new each run and project.

test.use({ locale: "en-GB" });

test("asks about my data, adding an email first", async ({ page }) => {
  test.setTimeout(120_000);
  const visible = { visible: true } as const;
  const address = `rosa-${randomUUID().slice(0, 8)}@example.com`;

  await signUp(page, english, "Rósa");
  await page.goto("/settings");
  await page.getByRole("button", { name: "Privacy and your data" }).click();
  await page.getByRole("button", { name: "Ask about my data" }).click();
  await expect(page.getByRole("heading", { name: "Ask about my data" })).toBeVisible();
  await expect(
    page.getByText("We answer by email, so add your email first.").filter(visible),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add my email" }).click();
  await expect(page).toHaveURL("/settings/email");
  await page.getByLabel("Email", { exact: true }).fill(address);
  await page.getByRole("button", { name: "Send the link" }).click();
  const confirm = await emailTo(address, /^Confirm your email for ShareRide$/);
  await page.goto(linkIn(confirm, "Confirm my email"));
  await expect(page.getByRole("heading", { name: "Your email is added" })).toBeVisible();

  await page.goto("/settings/privacy/ask");
  await expect(page.getByText(`We answer at ${address}.`).filter(visible)).toBeVisible();
  await page.getByRole("radio", { name: /^Ask a question/ }).click();
  await page.getByLabel("Your message").fill("How long do you keep my trips?");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(
    page.getByText("Thank you. We'll answer by email within a month.").filter(visible),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to Privacy" }).click();
  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
});
