import { expect, type Page } from "@playwright/test";

// The web app on a laptop (spec 18): what every wide screen must keep.

/** The narrowest wide window, the desktop project's own, and a common laptop. */
export const widths = [900, 1280, 1440] as const;

/** A laptop window of this width. */
export function laptop(width: number) {
  return { width, height: 900 };
}

/**
 * Neither the document, a screen's own scroll (or that of a pane of
 * Messages) nor the top bar is wider than what it shows: nothing on the
 * page is cut off or reached only by scrolling sideways.
 */
export async function expectNoSidewaysScroll(page: Page) {
  const wider = await page.evaluate(() => {
    const parts = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-testid="screen-scroll"], [data-testid="pane-scroll"], [data-testid="top-bar"]',
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
