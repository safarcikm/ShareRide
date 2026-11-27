import type { Locator, Page } from "@playwright/test";

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
 * its head or its bar, with `words` choosing the texts to read in it, and
 * `nth` another than the first of several:
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
  /** Which of the parts in view with this test id, counted from 0. */
  nth = 0,
): Promise<{
  readonly past: readonly string[];
  readonly cut: readonly string[];
  readonly brokenWords: readonly string[];
  readonly needlessly: readonly string[];
  readonly beyondWindow: number;
  readonly screenWider: number;
}> {
  return page.evaluate(
    ({ id, texts, at }) => {
      const ticket = [...document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)].filter(
        (found) => found.getClientRects().length > 0,
      )[at];
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
      // A screen's bar stands under what scrolls, not in it.
      const screen =
        ticket.closest<HTMLElement>('[data-testid="screen-scroll"]') ??
        ticket
          .closest('[data-testid="screen-safe-area"]')
          ?.querySelector<HTMLElement>('[data-testid="screen-scroll"]') ??
        null;
      if (screen === null) throw new Error(`The ${id} is on no screen`);
      const screenWider = screen.scrollWidth - screen.clientWidth;
      return { past, cut, brokenWords, needlessly, beyondWindow, screenWider };
    },
    { id: testId, texts: words, at: nth },
  );
}

/**
 * The texts to see in a part of a screen: `shown` is each of them, `over`
 * the pairs that stand over one another, as names with no room beside each
 * other do, and `past` those that reach past the part's edges. A text that
 * is not seen, as one kept only to be measured, is not counted.
 */
export function textsToSee(part: Locator): Promise<{
  readonly shown: readonly string[];
  readonly over: readonly string[];
  readonly past: readonly string[];
}> {
  return part.evaluate((within) => {
    const edge = within.getBoundingClientRect();
    const texts = [...within.querySelectorAll<HTMLElement>("[dir]")]
      .filter((text) => text.checkVisibility({ checkOpacity: true }))
      .filter((text) => text.textContent.trim() !== "")
      .map((text) => ({ text, words: text.textContent, box: text.getBoundingClientRect() }));
    const over: string[] = [];
    for (const [at, one] of texts.entries()) {
      for (const other of texts.slice(at + 1)) {
        if (one.text.contains(other.text) || other.text.contains(one.text)) continue;
        const across =
          Math.min(one.box.right, other.box.right) - Math.max(one.box.left, other.box.left);
        const down =
          Math.min(one.box.bottom, other.box.bottom) - Math.max(one.box.top, other.box.top);
        if (across > 1 && down > 1) over.push(`${one.words} / ${other.words}`);
      }
    }
    const past = texts
      .filter(({ box }) => box.left < edge.left - 0.5 || box.right > edge.right + 0.5)
      .map(({ words }) => words);
    return { shown: texts.map(({ words }) => words), over, past };
  });
}

/**
 * How the menu's bar at the bottom of a phone holds its places (spec 16,
 * 3.1):
 *
 * - `places`: how many it shows.
 * - `rows`: on how many rows they stand.
 * - `namesPast`: the names that reach past their own place.
 * - `over`: the pairs of places that stand over one another.
 * - `iconsOffLine`: the places whose icon is higher or lower than the
 *   first of their row.
 * - `beyondWindow`: by how many pixels the bar or a place reaches past the
 *   window's sides.
 */
export function menuFit(page: Page): Promise<{
  readonly places: number;
  readonly rows: number;
  readonly namesPast: readonly string[];
  readonly over: readonly string[];
  readonly iconsOffLine: readonly string[];
  readonly beyondWindow: number;
}> {
  return page.evaluate(() => {
    const bar = [...document.querySelectorAll<HTMLElement>('[data-testid="tab-bar"]')].find(
      (found) => found.getClientRects().length > 0,
    );
    if (bar === undefined) throw new Error("No menu bar in view");
    const places = [...bar.querySelectorAll<HTMLElement>("a")].map((place) => ({
      name: place.querySelector("[dir]"),
      icon: place.querySelector("svg"),
      box: place.getBoundingClientRect(),
    }));
    const said = (place: (typeof places)[number]) => place.name?.textContent ?? "";
    const namesPast = places.filter(({ name, box }) => {
      const words = name?.getBoundingClientRect();
      return words === undefined || words.left < box.left - 0.5 || words.right > box.right + 0.5;
    });
    const over: string[] = [];
    for (const [at, one] of places.entries()) {
      for (const other of places.slice(at + 1)) {
        const across =
          Math.min(one.box.right, other.box.right) - Math.max(one.box.left, other.box.left);
        const down =
          Math.min(one.box.bottom, other.box.bottom) - Math.max(one.box.top, other.box.top);
        if (across > 1 && down > 1) over.push(`${said(one)} / ${said(other)}`);
      }
    }
    const iconsOffLine = places.filter((place) => {
      const first = places.find((other) => Math.abs(other.box.top - place.box.top) <= 1);
      const top = place.icon?.getBoundingClientRect().top;
      const firstTop = first?.icon?.getBoundingClientRect().top;
      return top === undefined || firstTop === undefined || Math.abs(top - firstTop) > 1;
    });
    const edges = [bar.getBoundingClientRect(), ...places.map(({ box }) => box)];
    const beyondWindow = Math.max(
      0,
      ...edges.map((box) => Math.ceil(box.right - window.innerWidth)),
      ...edges.map((box) => Math.ceil(-box.left)),
    );
    const tops: number[] = [];
    for (const { box } of places) {
      if (!tops.some((top) => Math.abs(top - box.top) <= 1)) tops.push(box.top);
    }
    return {
      places: places.length,
      rows: tops.length,
      namesPast: namesPast.map(said),
      over,
      iconsOffLine: iconsOffLine.map(said),
      beyondWindow,
    };
  });
}

/**
 * Text at 200% (WCAG 1.4.4), as a browser's text-only zoom sets it: the
 * text there is, and the text drawn after, as when a part of the screen
 * takes another place for the larger text.
 */
export async function twiceAsLarge(page: Page) {
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
    const enlarge = (text: HTMLElement) => {
      if (text.dataset["twice"] !== undefined) return;
      text.dataset["twice"] = "";
      const style = getComputedStyle(text);
      text.style.fontSize = `${String(parseFloat(style.fontSize) * 2)}px`;
      text.style.lineHeight = `${String(parseFloat(style.lineHeight) * 2)}px`;
    };
    for (const text of document.querySelectorAll<HTMLElement>("[dir]")) enlarge(text);
    new MutationObserver((changes) => {
      for (const change of changes) {
        for (const added of change.addedNodes) {
          if (!(added instanceof HTMLElement)) continue;
          if (added.matches("[dir]")) enlarge(added);
          for (const text of added.querySelectorAll<HTMLElement>("[dir]")) enlarge(text);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
}
