import { expect, test } from "@playwright/test";
import { english, signUp } from "./support/account";
import { focused } from "./support/trips";

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
  await page.getByRole("link", { name: "Ask about my data" }).click();
  await expect(page.getByRole("heading", { name: "Ask about my data" })).toBeVisible();
  await expect(page.getByText(`We answer at ${address}.`).filter(visible)).toBeVisible();
  await page.getByRole("radio", { name: /^Ask a question/ }).click();
  await page.getByLabel("Your message").fill("How long do you keep my rides?");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  // The thanks are the page's title now, and they have focus: the button
  // pressed is gone (spec 31, 3.19).
  const thanks = "Thank you. We'll answer by email within a month.";
  await expect(page.getByRole("heading", { name: thanks })).toBeVisible();
  await expect.poll(() => focused(page)).toContain(thanks);
  // The way back is the main button, in the bar.
  const bar = page.getByTestId("bottom-bar").filter(visible);
  await expect(bar.getByRole("button", { name: "Back to Privacy" })).toBeInViewport();
  await bar.getByRole("button", { name: "Back to Privacy" }).click();
  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
});
