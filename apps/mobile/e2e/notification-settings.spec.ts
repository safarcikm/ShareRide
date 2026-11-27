import { expect, test } from "@playwright/test";
import { english, signUp } from "./support/account";

// Trip reminders (spec 7, 3.6, item 1) on the web build: on at first,
// turned off on the Notifications page, which Profile opens, and still off
// after a reload, as the account
// keeps it.

test.use({ locale: "en-GB" });

test("turns trip reminders off from Profile, and they stay off", async ({ page }) => {
  await signUp(page, english, "Rósa");
  await page.goto("/profile");
  await page.getByRole("link", { name: "Notifications", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/notifications$/);
  await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible();
  const reminders = page.getByRole("switch", { name: /^Ride reminders/ });
  await expect(reminders).toBeChecked();
  await expect(
    page.getByText(
      "Notifications about bookings, rides, payments and messages are always on, because others rely on them.",
    ),
  ).toBeVisible();

  await reminders.click();
  await expect(reminders).not.toBeChecked();
  await page.reload();
  await expect(page.getByRole("switch", { name: /^Ride reminders/ })).not.toBeChecked();
});
