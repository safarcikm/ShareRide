import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";

// The web app on a laptop (spec 18): what every wide screen must keep.

/** The narrowest wide window, the desktop project's own, and a common laptop. */
export const widths = [900, 1280, 1440] as const;

/** A laptop window of this width. */
export function laptop(width: number) {
  return { width, height: 900 };
}

/**
 * Neither the document, a screen's own scroll (or that of a pane of
 * Messages or of a side column) nor the top bar is wider than what it
 * shows: nothing on the page is cut off or reached only by scrolling
 * sideways.
 */
export async function expectNoSidewaysScroll(page: Page) {
  const wider = await page.evaluate(() => {
    const parts = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-testid="screen-scroll"], [data-testid="pane-scroll"], [data-testid="top-bar"], [data-testid="columns-side-scroll"]',
      ),
    ];
    return [document.documentElement, ...parts]
      .filter((part) => part.clientWidth > 0)
      .map((part) => part.scrollWidth - part.clientWidth);
  });
  // The document, the bar and at least one screen.
  expect(wider.length).toBeGreaterThan(2);
  for (const extra of wider) expect(extra).toBeLessThanOrEqual(0);
}

/**
 * Where a journey looks for what an open conversation says. On a laptop my
 * conversations stand beside it (spec 18, 3.11), and its row there shows
 * its last message too, so the journey looks in the conversation's own
 * pane. On a phone the conversation has the screen to itself.
 */
export function openConversation(page: Page, testInfo: TestInfo): Page | Locator {
  return testInfo.project.use.isMobile === true ? page : page.getByTestId("panes-open");
}
