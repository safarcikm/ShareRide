import type { Page } from "@playwright/test";

// How parts of a screen stand beside each other, measured in the browser.

/**
 * The profile pictures in view, and for each that starts under the top of
 * what is written beside it, by how many pixels. A picture stands with the
 * name: at the top of a tall block of text, not at its middle (spec 31,
 * 3.18). A screen under the one open stays in the page, hidden, and is not
 * counted.
 */
export function picturesUnderTheirText(
  page: Page,
): Promise<{ readonly pictures: number; readonly under: readonly number[] }> {
  return page.evaluate(() => {
    const pictures = [...document.querySelectorAll('[data-testid="avatar"]')].filter(
      (picture) => picture.getClientRects().length > 0,
    );
    const under = pictures.flatMap((picture) => {
      const beside = picture.nextElementSibling;
      if (beside === null) return [];
      const by = picture.getBoundingClientRect().top - beside.getBoundingClientRect().top;
      return by > 1 ? [Math.round(by)] : [];
    });
    return { pictures: pictures.length, under };
  });
}
