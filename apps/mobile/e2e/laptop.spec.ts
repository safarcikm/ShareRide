import { expect, test } from "@playwright/test";
import { expectNoSidewaysScroll, laptop, widths } from "./support/laptop";

// The web app on a laptop (spec 18): the top bar's content lines up with the
// page, the logo opens Find, and no screen scrolls sideways at the widths a
// laptop window has. Each wide screen joins here as it is built.

test.skip(({ isMobile }) => isMobile, "Laptop windows; phones have their own journeys.");

/** Screens anyone can open, by the heading that shows they are ready. */
const open = [
  { path: "/", heading: "Where are you going?" },
  { path: "/meeting-points", heading: "Meeting points" },
  { path: "/profile", heading: "Profile" },
] as const;

for (const width of widths) {
  test.describe(`a window ${String(width)} wide`, () => {
    test.use({ viewport: laptop(width), locale: "en-GB" });

    test("shows the top bar, and no screen scrolls sideways", async ({ page }) => {
      for (const { path, heading } of open) {
        await page.goto(path);
        await expect(
          page.getByRole("heading", { name: heading }).filter({ visible: true }),
        ).toBeVisible();
        await expect(page.getByTestId("top-bar")).toBeVisible();
        await expectNoSidewaysScroll(page);
      }
    });
  });
}

test.describe("the top bar", () => {
  test.use({ viewport: laptop(1440), locale: "en-GB" });

  test("lines its logo and its language up with the page's edges", async ({ page }) => {
    await page.goto("/meeting-points");
    const bar = page.getByTestId("top-bar");
    const home = bar.getByRole("link", { name: "ShareRide, to the front page" });
    await expect(home).toBeVisible();
    // A page is 1144 wide in the middle of the window: from 148 to 1292.
    const logo = await home.boundingBox();
    expect(logo?.x).toBeCloseTo(148, 0);
    const language = await bar.getByText("Íslenska").boundingBox();
    expect((language?.x ?? 0) + (language?.width ?? 0)).toBeCloseTo(1292, 0);
    // The page under it keeps room for a scrollbar at both sides, so it
    // stays in the middle where a scrollbar takes room.
    await expect(page.getByTestId("screen-scroll").filter({ visible: true })).toHaveCSS(
      "scrollbar-gutter",
      "stable both-edges",
    );
  });

  test("opens Find from the logo", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
    await page
      .getByTestId("top-bar")
      .getByRole("link", { name: "ShareRide, to the front page" })
      .click();
    await expect(page.getByRole("heading", { name: "Where are you going?" })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });
});
