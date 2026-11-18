import { expect, test } from "@playwright/test";
import { laptop } from "./support/laptop";

// The top bar over the page where the browser's scrollbar takes room, as on
// Windows and Linux (spec 18, 3.3). The other journeys run with scrollbars
// hidden, as Playwright's browser has them; this one shows them. The launch
// options are the whole file's, so it has a file of its own.

// Expo types process.env loosely; read it as plain strings.
const env = process.env as Readonly<Record<string, string | undefined>>;

test.use({
  locale: "en-GB",
  launchOptions: {
    // As in playwright.config.ts, which these options take the place of.
    executablePath: env["PLAYWRIGHT_CHROMIUM_PATH"],
    ignoreDefaultArgs: ["--hide-scrollbars"],
  },
});

test.skip(({ isMobile }) => isMobile, "Laptop windows; phones have their own journeys.");

// 1000 wide: the window is narrower than a page, so the bar and the page
// each start at their own padding. 1440: both sit in the middle.
for (const width of [1000, 1440]) {
  test(`the top bar's content has the page's edges, ${String(width)} wide`, async ({ page }) => {
    await page.setViewportSize(laptop(width));
    await page.goto("/meeting-points");
    await expect(page.getByRole("heading", { name: "Meeting points" })).toBeVisible();
    const scroll = page.getByTestId("screen-scroll").filter({ visible: true });
    // The list is longer than the window, and its scrollbar takes room.
    const scrollbar = await scroll.evaluate(
      (part: HTMLElement) => part.offsetWidth - part.clientWidth,
    );
    expect(scrollbar).toBeGreaterThan(0);

    const bar = await page.getByTestId("top-bar-content").boundingBox();
    const back = await page.getByRole("button", { name: "Back" }).boundingBox();
    const map = await page.getByTestId("aside").boundingBox();
    expect(bar?.x).toBeCloseTo(back?.x ?? -1, 0);
    expect((bar?.x ?? 0) + (bar?.width ?? 0)).toBeCloseTo((map?.x ?? 0) + (map?.width ?? 0), 0);
  });
}
