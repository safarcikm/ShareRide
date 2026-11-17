import { expect, test } from "@playwright/test";
import { apiUrl } from "../playwright.config";
import { english, signUp } from "./support/account";

// Spec 9's suspension on the web build: ShareRide suspends a person (the
// test API does what the console will), and the app then shows Find and
// Offer as the suspension, leads to Notices with the reason, and takes one
// appeal, which waits for ShareRide's answer.

test.use({ locale: "en-GB" });

const reason = "Repeated messages after being asked to stop.";

test("a suspended person reads why and appeals", async ({ page }) => {
  test.slow();
  const visible = { visible: true } as const;
  const { phone } = await signUp(page, english, "Ari");

  const suspended = await page.request.post(`${apiUrl}/e2e/suspend`, {
    data: { phone: phone.e164, reason },
  });
  expect(suspended.ok()).toBe(true);

  // The app learns of it when it opens again.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your account is suspended" })).toBeVisible();
  await expect(page.getByText("With no end date.").filter(visible)).toBeVisible();
  await expect(page.getByText(`Reason: ${reason}`).filter(visible)).toBeVisible();
  await page.getByRole("button", { name: "Read why and appeal" }).click();
  await expect(page.getByRole("heading", { name: "Notices" })).toBeVisible();
  await expect(
    page.getByText("Your account is suspended with no end date").filter(visible),
  ).toBeVisible();
  await expect(page.getByText("Rule: Harassment").filter(visible)).toBeVisible();
  await expect(page.getByText(`Reason: ${reason}`).filter(visible)).toBeVisible();

  await page.getByRole("button", { name: "Appeal", exact: true }).click();
  await page.getByLabel("Why do you disagree?").fill("I was not there that day.");
  await page.getByRole("button", { name: "Send appeal" }).click();
  await expect(page.getByText(/^Your appeal, sent /).filter(visible)).toBeVisible();
  await expect(
    page.getByText("ShareRide will look at it and answer here.").filter(visible),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Appeal", exact: true })).toHaveCount(0);

  // It stays sent.
  await page.reload();
  await expect(page.getByText("I was not there that day.").filter(visible)).toBeVisible();

  // Offering a ride is closed too.
  await page.goto("/offer");
  await expect(page.getByRole("heading", { name: "Your account is suspended" })).toBeVisible();
});
