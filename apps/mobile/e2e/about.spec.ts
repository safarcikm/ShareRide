import { expect, test } from "@playwright/test";
import { expectNoSidewaysScroll, laptop, widths } from "./support/laptop";

// About and the website's footer (spec 30). Screens opened earlier stay in
// the page, hidden, with footers of their own, so each check is scoped to
// the footer on show.
const shown = { visible: true } as const;

test.describe("About and the footer", () => {
  test.use({ locale: "en-GB" });

  test("the front page's footer opens About, then the Privacy Policy", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Share your ride" })).toBeVisible();
    const footer = page.getByRole("contentinfo").filter(shown);
    await expect(footer).toHaveAccessibleName("About PuffinRide and our terms");
    await footer.getByRole("link", { name: "About PuffinRide" }).click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByRole("heading", { level: 1, name: "About PuffinRide" })).toBeVisible();
    await expect(page).toHaveTitle("About PuffinRide · PuffinRide");
    // About's own row; the footer under it has one too.
    await page
      .getByTestId("screen-scroll")
      .filter(shown)
      .getByRole("link", { name: "Privacy Policy" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/legal\/privacy$/);
  });

  test("its links are real ones: pages in the app, an email, Facebook and Instagram in a new tab", async ({
    page,
  }) => {
    await page.goto("/carpool-iceland");
    const footer = page.getByRole("contentinfo").filter(shown);
    await expect(footer.getByRole("link", { name: "Terms of Service" })).toHaveAttribute(
      "href",
      "/legal/terms",
    );
    await expect(footer.getByRole("link", { name: "admin@puffinride.is" })).toHaveAttribute(
      "href",
      "mailto:admin@puffinride.is",
    );
    for (const name of [/Facebook$/, /Instagram$/]) {
      const page = footer.getByRole("link", { name });
      await expect(page).toHaveAttribute("target", "_blank");
      await expect(page).toHaveAttribute("rel", "noopener noreferrer");
    }
    await expect(footer.getByRole("link", { name: /Instagram$/ })).toHaveAttribute(
      "href",
      "https://www.instagram.com/puffinride.is/",
    );
  });

  test("the old address leads to About", async ({ page }) => {
    await page.goto("/legal?lang=is");
    await expect(page).toHaveURL(/\/about\?lang=is$/);
    await expect(page.getByRole("heading", { level: 1, name: "Um PuffinRide" })).toBeVisible();
  });

  test("its address #co2 opens What a shared ride saves, in view (spec 34, 3.9)", async ({
    page,
  }) => {
    // A phone's window, short enough that the section starts below it.
    await page.setViewportSize({ width: 375, height: 360 });
    await page.goto("/about");
    const section = page.getByRole("heading", { name: "What a shared ride saves" });
    await expect(section).toBeAttached();
    await expect(section).not.toBeInViewport();
    // A fresh load, as from a shared link: the section comes after the page has loaded.
    await page.goto("about:blank");
    await page.goto("/about#co2");
    await expect(section).toHaveAttribute("id", "co2");
    await expect(section).toBeInViewport();
    // The test API's value: 150 g, so the 390 km example is about 58 kg.
    await expect(page.getByText(/about 58\skg of CO₂/)).toBeVisible();
  });

  test("signing in has no footer", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { level: 1 }).filter(shown).first()).toBeVisible();
    await expect(page.getByRole("contentinfo").filter(shown)).toHaveCount(0);
  });
});

test.describe("the footer on a laptop", () => {
  test.use({ locale: "en-GB" });
  test.skip(({ isMobile }) => isMobile, "Laptop windows; phones have their own journeys.");

  for (const width of widths) {
    test(`lines up with the page under its line, ${String(width)} wide`, async ({ page }) => {
      await page.setViewportSize(laptop(width));
      await page.goto("/about");
      await expect(page.getByRole("heading", { level: 1, name: "About PuffinRide" })).toBeVisible();
      const footer = page.getByRole("contentinfo").filter(shown);
      await expect(footer.getByText("Carpooling across Iceland")).toBeVisible();
      const content = await footer.getByTestId("site-footer-content").boundingBox();
      const bar = await page.getByTestId("top-bar-content").boundingBox();
      // As the top bar's content is: at the page's edges.
      expect(content?.x).toBeCloseTo(bar?.x ?? -1, 0);
      expect(content?.width).toBeCloseTo(bar?.width ?? -1, 0);
      await expectNoSidewaysScroll(page);
    });
  }
});
