import { expect, test } from "@playwright/test";
import { menuLink } from "./support/account";

test.describe("Find, the home, on the web", () => {
  test.use({ locale: "en-GB" });

  test("opens in English, switches to Icelandic and remembers it", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Where are you going?" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.getByRole("button", { name: "Change the language to Icelandic" }).click();
    await expect(page.getByRole("heading", { name: "Hvert ertu að fara?" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "is");

    await page.reload();
    await expect(page.getByRole("heading", { name: "Hvert ertu að fara?" })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Where are you going?" })).toBeVisible();
    await page.getByRole("button", { name: /^N1 Borgarnes,/ }).click();
    await page.getByRole("button", { name: /^To: / }).click();
    await page.getByLabel("To", { exact: true }).fill("blondu");
    await page.getByRole("button", { name: /^Olís Blönduós,/ }).click();
    await page.getByRole("button", { name: "Find a ride", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: "Change search: N1 Borgarnes → Olís Blönduós, Any day, 1 seat",
      }),
    ).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Sign in or create an account" })).toBeVisible();
    await page.goBack();
    await menuLink(page, "Profile").click();
    await expect(page).toHaveURL(/\/profile$/);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sign in or create an account" })).toBeVisible();
  });

  test("shows the menu on every main place, marking the one you are on", async ({ page }) => {
    await page.goto("/");
    await expect(menuLink(page, "Find")).toHaveAttribute("aria-current", "page");
    await menuLink(page, "My rides").click();
    await expect(page).toHaveURL(/\/my-rides$/);
    await expect(page.getByRole("heading", { name: "Sign in to see your rides" })).toBeVisible();
    await expect(menuLink(page, "My rides")).toHaveAttribute("aria-current", "page");
    await expect(menuLink(page, "Find")).not.toHaveAttribute("aria-current", "page");
    await menuLink(page, "Messages").click();
    await expect(page).toHaveURL(/\/messages$/);
    await expect(page.getByRole("heading", { name: "Sign in to see your messages" })).toBeVisible();
    await expect(menuLink(page, "Messages")).toHaveAttribute("aria-current", "page");
    await menuLink(page, "Offer").click();
    await expect(page.getByRole("button", { name: "Sign in to offer a ride" })).toBeVisible();
    // A link in the browser's sense: it has an address, and a click with
    // Ctrl or Cmd opens it in a new tab while the app stays where it is.
    await expect(menuLink(page, "Find")).toHaveAttribute("href", "/");
    const [newTab] = await Promise.all([
      page.context().waitForEvent("page"),
      menuLink(page, "Profile").click({ modifiers: ["ControlOrMeta"] }),
    ]);
    await expect(newTab).toHaveURL(/\/profile$/);
    await expect(page).toHaveURL(/\/offer$/);
    await newTab.close();
  });
});

test.describe("Find in Icelandic", () => {
  test.use({ locale: "is-IS" });

  test("opens in Icelandic when the browser prefers Icelandic", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Hvert ertu að fara?" })).toBeVisible();
  });
});
