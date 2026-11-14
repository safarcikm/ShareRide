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

  test("leads from Browse trips to the search", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Browse trips" }).click();
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByRole("heading", { name: "Find a ride" })).toBeVisible();
  });
});

test.describe("welcome in Icelandic", () => {
  test.use({ locale: "is-IS" });

  test("opens in Icelandic when the browser prefers Icelandic", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Samferða um allt Ísland" })).toBeVisible();
  });
});
