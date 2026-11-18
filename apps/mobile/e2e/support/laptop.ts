import { expect, type Page } from "@playwright/test";

// The web app on a laptop (spec 18): what every wide screen must keep.

/** The narrowest wide window, the desktop project's own, and a common laptop. */
export const widths = [900, 1280, 1440] as const;

/** A laptop window of this width. */
export function laptop(width: number) {
  return { width, height: 900 };
}

/**
 * Neither the document nor a screen's own scroll is wider than what it
 * shows: nothing on the page is reached only by scrolling sideways.
 */
export async function expectNoSidewaysScroll(page: Page) {
  const wider = await page.evaluate(() => {
    const scrolls = [...document.querySelectorAll<HTMLElement>('[data-testid="screen-scroll"]')];
    return [document.documentElement, ...scrolls]
      .filter((part) => part.clientWidth > 0)
      .map((part) => part.scrollWidth - part.clientWidth);
  });
  expect(wider.length).toBeGreaterThan(1);
  for (const extra of wider) expect(extra).toBeLessThanOrEqual(0);
}
