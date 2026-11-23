import { expect, test } from "@playwright/test";

// What a search engine that runs the app reads (spec 23, 3.4 to 3.6). The
// server's own head and noindex answers are the API's tests.
test.describe("public pages for search engines", () => {
  test.use({ locale: "en-GB" });

  test("an address with lang opens in that language, with its title, description and addresses", async ({
    page,
  }) => {
    await page.goto("/meeting-points?lang=is");
    await expect(page.getByRole("heading", { level: 1, name: "Mótsstaðir" })).toBeVisible();
    await expect(page).toHaveTitle("Mótsstaðir · PuffinRide");
    await expect(page.locator("html")).toHaveAttribute("lang", "is");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      /^Mótsstaðirnir þar sem/,
    );
    await expect(page.locator('meta[name="keywords"]')).toHaveAttribute(
      "content",
      /^samferða, far, /,
    );
    const origin = new URL(page.url()).origin;
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${origin}/meeting-points?lang=is`,
    );
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute(
      "href",
      `${origin}/meeting-points?lang=en`,
    );
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
      "href",
      `${origin}/meeting-points`,
    );
  });

  test("Find has its title, and keeps the drivers' names out of snippets", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Share your ride" })).toBeVisible();
    await expect(page).toHaveTitle("PuffinRide · Carpool and shared rides across Iceland");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    // The e2e API seeds sample trips, so the rides leaving soon are there.
    const rides = page.locator("[data-nosnippet]");
    await expect(rides).toHaveCount(1);
    await expect(rides.getByRole("heading", { name: "Leaving soon" })).toBeVisible();
  });
});
