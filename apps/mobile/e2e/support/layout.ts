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

/** The names of the places at a ticket's two ends. */
const placesOfTicket =
  '[data-testid="ticket-from-place"] [dir], [data-testid="ticket-to-place"] [dir]';

/**
 * How a ticket holds what is in it (spec 31, review focus 3), for the first
 * ticket in view with this test id; or another part of a screen, such as
 * its head, with `words` choosing the texts to read in it:
 *
 * - `past`: the parts that reach past its edges. The notches of the tear
 *   line sit half outside the ticket on purpose and are not counted.
 * - `cut`: the places whose text is cut.
 * - `brokenWords`: the lines of a place that end inside a word, each shown
 *   with a bar where the line ends.
 * - `needlessly`: those of them whose word has room on a line of its place
 *   as it stands. A word longer than that can only be broken.
 * - `beyondWindow`: by how many pixels the ticket reaches past the window.
 * - `screenWider`: by how many pixels the screen it is on scrolls sideways.
 *   The screen cuts what is too wide, so the document would not show it.
 */
export function ticketFit(
  page: Page,
  testId: string,
  words = placesOfTicket,
): Promise<{
  readonly past: readonly string[];
  readonly cut: readonly string[];
  readonly brokenWords: readonly string[];
  readonly needlessly: readonly string[];
  readonly beyondWindow: number;
  readonly screenWider: number;
}> {
  return page.evaluate(
    ({ id, texts }) => {
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
      const places = [...ticket.querySelectorAll<HTMLElement>(texts)];
      const cut = places
        .filter((place) => place.scrollWidth > place.clientWidth + 1)
        .map((place) => place.textContent);
      const brokenWords: string[] = [];
      const needlessly: string[] = [];
      for (const place of places) {
        const [letters] = place.childNodes;
        if (letters?.nodeType !== Node.TEXT_NODE) continue;
        const text = letters.textContent ?? "";
        const range = document.createRange();
        /** The top of each letter's line; a space at a line's end has no box. */
        const tops = Array.from({ length: text.length }, (_, at) => {
          range.setStart(letters, at);
          range.setEnd(letters, at + 1);
          const [box] = range.getClientRects();
          return box === undefined || box.width === 0 ? null : Math.round(box.top);
        });
        for (let at = 1; at < text.length; at += 1) {
          const before = tops[at - 1] ?? null;
          const here = tops[at] ?? null;
          if (before === null || here === null || here <= before + 2) continue;
          const ends = text.charAt(at - 1);
          if (/\s/.test(ends) || ends === "-") continue;
          const shown = `${text.slice(0, at)}|${text.slice(at)}`;
          brokenWords.push(shown);
          // The word around the break, and how wide it is in one piece.
          const starts = text.slice(0, at).search(/\S+$/);
          const rest = text.slice(at).search(/\s/);
          range.setStart(letters, starts);
          range.setEnd(letters, rest === -1 ? text.length : at + rest);
          const wide = [...range.getClientRects()].reduce((sum, piece) => sum + piece.width, 0);
          if (wide <= place.clientWidth) needlessly.push(shown);
        }
      }
      const beyondWindow = Math.max(
        0,
        Math.ceil(edge.right - window.innerWidth),
        Math.ceil(-edge.left),
      );
      const screen = ticket.closest<HTMLElement>('[data-testid="screen-scroll"]');
      if (screen === null) throw new Error(`The ${id} is on no screen`);
      const screenWider = screen.scrollWidth - screen.clientWidth;
      return { past, cut, brokenWords, needlessly, beyondWindow, screenWider };
    },
    { id: testId, texts: words },
  );
}
