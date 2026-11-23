import { expect, test } from "@playwright/test";
import { english, menuLink, signIn } from "./support/account";
import { confirmedBooking, secondPage, visible } from "./support/cancelling";
import { confirmCodeSubject, emailedCode } from "./support/email";

// Delete my account (spec 11, 3.4) on the web build, as in the plan's goal:
// Dóra's paid booking for tomorrow is still open, so she cancels it from
// the deletion screen under the normal rules, comes back, confirms with a
// fresh code and is signed out. Signing in again shows only when her
// account goes, and she keeps it.

test.use({ locale: "en-GB" });

const scheduled = /^Your account will be deleted on \d{1,2} [A-Z][a-z]+\.$/;

test("deletes an account after cancelling its booking, then keeps it on signing in", async ({
  page: driver,
  browser,
}, testInfo) => {
  test.slow();
  const { page: dora, close } = await secondPage(browser, testInfo);
  const { booking, passengerEmail } = await confirmedBooking(driver, dora);

  // Settings, then Privacy: the booking must be settled first.
  await dora.goto("/settings");
  await dora.getByRole("button", { name: "Privacy and your data" }).click();
  await dora.getByRole("button", { name: "Delete my account" }).click();
  await expect(dora.getByRole("heading", { name: "Delete my account" })).toBeVisible();
  await expect(
    dora.getByText("Before you can delete your account, these need to be settled:"),
  ).toBeVisible();
  // The Privacy page's row stays in the page behind this screen.
  const remove = dora.getByRole("button", { name: "Delete my account" }).filter(visible);
  await expect(remove).toHaveCount(0);

  // It opens the booking's own cancel screen (spec 6).
  await dora.getByRole("button", { name: /, Cancel your booking: / }).click();
  await expect(dora).toHaveURL(`${booking}/cancel`);
  await dora.getByRole("radio", { name: "Plans changed" }).click();
  await dora.getByRole("button", { name: "Cancel booking" }).click();
  await expect(dora).toHaveURL(`${booking}?cancelled=1`);

  // Back on the deletion screen, which looks again: nothing is open now.
  await dora.getByRole("button", { name: "Back", exact: true }).filter(visible).click();
  await expect(dora.getByRole("heading", { name: "Delete my account" })).toBeVisible();
  await expect(remove).toBeVisible();

  // A fresh code by email confirms it, and she is signed out.
  const code = await emailedCode(passengerEmail, confirmCodeSubject, () => remove.click());
  await dora.getByLabel("6-digit code").fill(code);
  await expect(dora.getByRole("heading", { name: scheduled })).toBeVisible();
  await dora.getByRole("button", { name: "Close" }).click();
  await menuLink(dora, english.profileTab).click();
  await expect(dora.getByRole("button", { name: english.signIn, exact: true })).toBeVisible();

  // Signing in meanwhile shows only when it goes; she keeps her account.
  await signIn(dora, english, passengerEmail);
  await expect(dora.getByRole("heading", { name: scheduled })).toBeVisible();
  await expect(dora).toHaveURL("/account/deletion");
  await dora.getByRole("button", { name: "Keep my account" }).click();
  await expect(dora.getByRole("heading", { name: english.findTitle })).toBeVisible();
  await close();
});
