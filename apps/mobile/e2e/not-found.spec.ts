import { expect, test } from "@playwright/test";

// An address the app does not have (spec 31, 3.21), on the web build: the
// app's own page in its look, in the visitor's language, with the way to
// Find in the bar; not the router's black page with a link to a list of
// every address, nor that list itself.

const visible = { visible: true } as const;

for (const words of [
  {
    locale: "en-GB",
    title: "We can't find this page",
    line: "The link may be old, or the address may have a mistake in it.",
    find: "Find a ride",
    front: "Share your ride",
  },
  {
    locale: "is-IS",
    title: "Við finnum ekki þessa síðu",
    line: "Hlekkurinn gæti verið gamall eða villa í slóðinni.",
    find: "Finna far",
    front: "Verum samferða",
  },
]) {
  test.describe(`an address the app does not have, ${words.locale}`, () => {
    test.use({ locale: words.locale });

    test("says so in the app's look and leads to Find", async ({ page }) => {
      // A list the app does not have, an address deep under one it has, and
      // where the router would list every address of the app.
      for (const address of ["/trips", "/drive/trips/nothing/here/at-all", "/_sitemap"]) {
        await page.goto(address);
        await expect(
          page.getByRole("heading", { level: 1, name: words.title }).filter(visible),
        ).toBeVisible();
        await expect(page.getByText(words.line, { exact: true }).filter(visible)).toBeVisible();
        await expect(page.getByText(/Unmatched Route|Sitemap/)).toHaveCount(0);
        // Not for search engines.
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      }
      // The one thing to do, in the bar and in view.
      const find = page
        .getByTestId("bottom-bar")
        .filter(visible)
        .getByRole("link", { name: words.find, exact: true });
      await expect(find).toBeInViewport();
      await find.click();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("heading", { name: words.front }).filter(visible)).toBeVisible();
    });
  });
}
