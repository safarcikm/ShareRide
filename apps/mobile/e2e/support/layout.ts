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

/**
 * How a ticket holds what is in it (spec 31, review focus 3), for the first
 * ticket in view with this test id: the parts that reach past its edges,
 * the places whose text is cut, and the lines of a place that end inside a
 * word, each shown with a bar where the line ends. All three are empty for
 * a ticket that holds its ride. The notches of the tear line sit half
 * outside the ticket on purpose and are not counted, and neither is a word
 * broken because it is longer than a whole line of its place: that is the
 * only way such a word stays in the ticket.
 */
export function ticketFit(
  page: Page,
  testId: string,
): Promise<{
  readonly past: readonly string[];
  readonly cut: readonly string[];
  readonly brokenWords: readonly string[];
}> {
  return page.evaluate((id) => {
    const ticket = [...document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)].find(
      (found) => found.getClientRects().length > 0,
    );
    if (ticket === undefined) throw new Error(`No ${id} in view`);
    const edge = ticket.getBoundingClientRect();
    const past = [...ticket.querySelectorAll<HTMLElement>("*")]
      .filter((part) => {
        if (part.dataset["testid"] === "ticket-notch") return false;
        const box = part.getBoundingClientRect();
        return box.width > 0 && (box.left < edge.left - 0.5 || box.right > edge.right + 0.5);
      })
      .map((part) => part.dataset["testid"] ?? part.textContent.slice(0, 40));
    const places = [
      ...ticket.querySelectorAll<HTMLElement>(
        '[data-testid="ticket-from-place"] [dir], [data-testid="ticket-to-place"] [dir]',
      ),
    ];
    const cut = places
      .filter((place) => place.scrollWidth > place.clientWidth + 1)
      .map((place) => place.textContent);
    const brokenWords = places.flatMap((place) => {
      const [letters] = place.childNodes;
      if (letters?.nodeType !== Node.TEXT_NODE) return [];
      const text = letters.textContent ?? "";
      const range = document.createRange();
      /** The top of each letter's line; a space at a line's end has no box. */
      const tops = Array.from({ length: text.length }, (_, at) => {
        range.setStart(letters, at);
        range.setEnd(letters, at + 1);
        const [box] = range.getClientRects();
        return box === undefined || box.width === 0 ? null : Math.round(box.top);
      });
      const broken: string[] = [];
      for (let at = 1; at < text.length; at += 1) {
        const before = tops[at - 1] ?? null;
        const here = tops[at] ?? null;
        if (before === null || here === null || here <= before + 2) continue;
        const ends = text.charAt(at - 1);
        if (/\s/.test(ends) || ends === "-") continue;
        // The word around the break, and how wide it is in one piece.
        const starts = text.slice(0, at).search(/\S+$/);
        const rest = text.slice(at).search(/\s/);
        range.setStart(letters, starts);
        range.setEnd(letters, rest === -1 ? text.length : at + rest);
        const wide = [...range.getClientRects()].reduce((sum, piece) => sum + piece.width, 0);
        if (wide > place.clientWidth) continue;
        broken.push(`${text.slice(0, at)}|${text.slice(at)}`);
      }
      return broken;
    });
    return { past, cut, brokenWords };
  }, testId);
}
