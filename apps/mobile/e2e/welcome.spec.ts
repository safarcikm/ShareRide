import { expect, test } from "@playwright/test";

test.describe("welcome on the web", () => {
  test.use({ locale: "en-GB" });

  test("opens in English, switches to Icelandic and remembers it", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Share the ride across Iceland" }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.getByRole("button", { name: "Change the language to Icelandic" }).click();
    await expect(page.getByRole("heading", { name: "Samferða um allt Ísland" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "is");

    await page.reload();
    await expect(page.getByRole("heading", { name: "Samferða um allt Ísland" })).toBeVisible();
  });

  test("shows the rides leaving soon, and opens one", async ({ page }) => {
    // The e2e API seeds sample trips from tomorrow on.
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Leaving soon" })).toBeVisible();
    const first = page.getByTestId("trip-result").first();
    await expect(first).toBeVisible();
    await first.click();
    await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}\?from=0&to=\d+$/);
    await expect(page.getByText("You'll sign in or create an account first.")).toBeVisible();
  });

  test("searches a route from the front page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^From: / }).click();
    // The place search drops down under the field, on the front page itself.
    await page.getByLabel("From", { exact: true }).fill("borgarn");
    await expect(
      page.getByRole("heading", { name: "Share the ride across Iceland" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^N1 Borgarnes,/ }).click();
    await page.getByRole("button", { name: /^To: / }).click();
    await page.getByLabel("To", { exact: true }).fill("blondu");
    await page.getByRole("button", { name: /^Olís Blönduós,/ }).click();
    await page.getByRole("button", { name: "Find a ride", exact: true }).click();
    await expect(page.getByRole("heading", { name: "N1 Borgarnes → Olís Blönduós" })).toBeVisible();
  });

  test("opens the place search with the keyboard, and gives focus back when it closes", async ({
    page,
  }) => {
    await page.goto("/");
    const from = page.getByRole("button", { name: /^From: / });
    await from.focus();
    await page.keyboard.press("Enter");
    const field = page.getByLabel("From", { exact: true });
    await expect(field).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(field).toBeHidden();
    await expect(from).toBeFocused();

    // Escape from a result too, and choosing one gives focus back as well.
    await from.press("Enter");
    await page.keyboard.type("borgarn");
    const result = page.getByRole("button", { name: /^N1 Borgarnes,/ });
    await result.focus();
    await page.keyboard.press("Escape");
    await expect(field).toBeHidden();
    await expect(from).toBeFocused();
    await from.press("Enter");
    await page.keyboard.type("borgarn");
    await result.press("Enter");
    await expect(page.getByRole("button", { name: /^From: N1 Borgarnes/ })).toBeFocused();
  });

  test("leads from Offer a ride and from Sign in to signing in", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Offer a ride", exact: true }).click();
    await expect(page.getByRole("heading", { name: "What's your phone number?" })).toBeVisible();
    await page.goBack();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "What's your phone number?" })).toBeVisible();
  });
});

test.describe("welcome in Icelandic", () => {
  test.use({ locale: "is-IS" });

  test("opens in Icelandic when the browser prefers Icelandic", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Samferða um allt Ísland" })).toBeVisible();
  });
});
