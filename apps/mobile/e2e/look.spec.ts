import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { soonestTripsRoute, type TripSearchResult } from "@shareride/contracts";
import { ticketFit } from "./support/layout";

// The look from spec 15 in a real browser: centred buttons that fit their label, the
// keyboard focus ring, the moss outline of a field you type in, the loaded
// fonts, and screenshots of the first screens for review (phone and desktop,
// light in English and dark in Icelandic). Screenshots are taken before any
// key is pressed, so they show the screens as a tap or click leaves them.

const schemes = [
  {
    colorScheme: "light",
    locale: "en-GB",
    focus: "rgb(31, 95, 139)",
    primary: "rgb(47, 107, 79)",
    title: "Share your ride",
    language: "Change the language to Icelandic",
    findRide: "Find a ride",
    offerRide: "Offer a ride",
    back: "Back",
    emailField: "Email",
    send: "Send code",
  },
  {
    colorScheme: "dark",
    locale: "is-IS",
    focus: "rgb(143, 203, 230)",
    primary: "rgb(124, 196, 158)",
    title: "Verum samferða",
    language: "Skipta yfir í ensku",
    findRide: "Finna far",
    offerRide: "Bjóða far",
    back: "Til baka",
    emailField: "Netfang",
    send: "Senda kóða",
  },
] as const;

/**
 * Presses Tab until `target` has keyboard focus. On Find each ride leaving
 * soon is two stops, the card and its share icon (spec 28, 3.1).
 */
async function tabTo(page: Page, target: Locator) {
  for (let presses = 0; presses < 40; presses += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`Tab never reached ${target.toString()}`);
}

/** The focus ring as the browser draws it. */
function outlineOf(target: Locator) {
  return target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      style: style.outlineStyle,
      width: style.outlineWidth,
      color: style.outlineColor,
      offset: style.outlineOffset,
    };
  });
}

/** Where a part sits on the page; it must be visible. */
async function box(target: Locator) {
  const found = await target.boundingBox();
  if (found === null) throw new Error(`${target.toString()} is not visible`);
  return found;
}

/** The horizontal middle of a box. */
const middle = (found: { x: number; width: number }) => found.x + found.width / 2;

/** True when the face is in the page's font list and has finished loading. */
async function fontLoaded(page: Page, family: string) {
  return page.evaluate(async (wanted) => {
    await document.fonts.ready;
    return [...document.fonts].some(
      (face) => face.family.replaceAll('"', "") === wanted && face.status === "loaded",
    );
  }, family);
}

/** Both fonts loaded, with a system font behind them on the web. */
async function expectFonts(page: Page) {
  expect(await fontLoaded(page, "Fredoka_600SemiBold")).toBe(true);
  expect(await fontLoaded(page, "Nunito_400Regular")).toBe(true);
  await expect(page.getByRole("heading").first()).toHaveCSS(
    "font-family",
    "Fredoka_600SemiBold, system-ui, sans-serif",
  );
}

for (const scheme of schemes) {
  test.describe(`the look, ${scheme.colorScheme}`, () => {
    test.use({ colorScheme: scheme.colorScheme, locale: scheme.locale });

    const ring = { style: "solid", width: "3px", color: scheme.focus, offset: "2px" };
    const screenshot = (page: Page, project: { outputDir: string; name: string }, name: string) =>
      page.screenshot({
        path: join(project.outputDir, "look", `${name}-${project.name}-${scheme.colorScheme}.png`),
        fullPage: true,
      });

    test("Find: fitted buttons, focus ring and fonts", async ({ page }, testInfo) => {
      await page.goto("/");
      const title = page.getByRole("heading", { name: scheme.title });
      const language = page.getByRole("button", { name: scheme.language });
      const findRide = page.getByRole("button", { name: scheme.findRide, exact: true });
      const offerRide = page.getByRole("button", { name: scheme.offerRide, exact: true });
      await expect(title).toBeVisible();
      await expectFonts(page);
      await screenshot(page, testInfo.project, "welcome");

      // On phones the language switch sits at the right of the column; wide
      // screens have it in the top bar. On phones the buttons sit in the
      // middle, under the centred title: Offer a ride fits its label, and
      // Find a ride is the main button across the search card, inside the
      // column (spec 16, 3.2). A wide page has the title at the left of the
      // scene, Find a ride at the end of the search row and Offer a ride
      // beside the rides, under "How it works" (spec 18, 3.5; spec 31, 3.16).
      const wide = (page.viewportSize()?.width ?? 0) >= 900;
      const column = await box(title);
      const languageBox = await box(language);
      if (wide) {
        await expect(
          page.getByTestId("top-bar").getByRole("button", { name: scheme.language }),
        ).toBeVisible();
      } else {
        expect(languageBox.x + languageBox.width).toBeCloseTo(column.x + column.width, 0);
      }
      for (const button of [findRide, offerRide]) {
        const found = await box(button);
        expect(found.width).toBeLessThan(column.width);
        if (!wide) expect(middle(found)).toBeCloseTo(middle(column), 0);
      }
      if (wide) {
        const row = await box(page.getByTestId("search-row"));
        const found = await box(findRide);
        expect(found.x + found.width).toBeCloseTo(row.x + row.width, 0);
      }
      if (wide) await expect(title).not.toHaveCSS("text-align", "center");
      else await expect(title).toHaveCSS("text-align", "center");

      await tabTo(page, offerRide);
      expect(await outlineOf(offerRide)).toEqual(ring);
    });

    test("sign-in: fitted button, focus ring, field outline and fonts", async ({
      page,
    }, testInfo) => {
      await page.goto("/sign-in");
      const back = page.getByRole("button", { name: scheme.back, exact: true });
      const field = page.getByRole("textbox", { name: scheme.emailField, exact: true });
      const send = page.getByRole("button", { name: scheme.send });
      await expect(field).toBeVisible();
      await expectFonts(page);
      await screenshot(page, testInfo.project, "sign-in");

      const sendBox = await box(send);
      const fieldBox = await box(field);
      expect(sendBox.width).toBeLessThan(fieldBox.width);
      expect(middle(sendBox)).toBeCloseTo(middle(fieldBox), 0);

      await tabTo(page, back);
      expect(await outlineOf(back)).toEqual(ring);
      // A field shows focus with its own outline turning moss, not the ring.
      await tabTo(page, field);
      expect((await outlineOf(field)).style).toBe("none");
      await expect(field).toHaveCSS("border-top-color", scheme.primary);
    });
  });
}

// Spec 31, review focus 3: a ride between places with long names, on the
// narrowest phone the app is made for. Find's rides are given such a ride
// first, as no sample ride has names this long.
test.describe("a ticket with long place names, 360 wide", () => {
  test.use({ locale: "en-GB" });

  for (const zoom of [1, 2] as const) {
    test(`holds its ride, with the text ${zoom === 1 ? "as set" : "twice as large"}`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "phone", "A phone's column; laptops have a grid.");
      await page.setViewportSize({ width: 360, height: 740 });
      await page.route(
        (url) => url.pathname === soonestTripsRoute.path,
        async (route) => {
          const response = await route.fetch();
          const { results } = (await response.json()) as { results: TripSearchResult[] };
          const [first, ...rest] = results;
          if (first === undefined) throw new Error("No ride leaves soon.");
          const named = (name: string) => ({ is: name, en: name });
          const long: TripSearchResult = {
            ...first,
            board: {
              ...first.board,
              meetingPoint: {
                ...first.board.meetingPoint,
                name: named("Kirkjubæjarklaustur, N1 við Skaftárskála"),
              },
            },
            alight: {
              ...first.alight,
              meetingPoint: {
                ...first.alight.meetingPoint,
                name: named("Keflavíkurflugvöllur, komusalur"),
              },
            },
          };
          await route.fulfill({ response, json: { results: [long, ...rest] } });
        },
      );
      await page.goto("/");
      const ticket = page.getByTestId("trip-result").first();
      await expect(ticket.getByText("Kirkjubæjarklaustur, N1 við Skaftárskála")).toBeVisible();
      if (zoom === 2) {
        // Text at 200% (WCAG 1.4.4), as a browser's text-only zoom sets it.
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
          for (const text of document.querySelectorAll<HTMLElement>("[dir]")) {
            const style = getComputedStyle(text);
            text.style.fontSize = `${String(parseFloat(style.fontSize) * 2)}px`;
            text.style.lineHeight = `${String(parseFloat(style.lineHeight) * 2)}px`;
          }
        });
      }
      const fit = await ticketFit(page, "trip-result");
      // Nothing reaches past the ticket and no place is cut, and the ticket
      // is whole in the window.
      expect(fit.past).toEqual([]);
      expect(fit.cut).toEqual([]);
      expect(fit.beyondWindow).toBe(0);
      // The times stay on their places' first lines, and the price is whole
      // inside the ticket, beside the timetable or under it.
      const from = await box(ticket.getByTestId("ticket-from-place"));
      const to = await box(ticket.getByTestId("ticket-to-place"));
      const time = await box(ticket.getByTestId("ticket-time").first());
      expect(Math.abs(time.y - from.y)).toBeLessThan(8 * zoom);
      const card = await box(ticket);
      const price = await box(ticket.getByTestId("ticket-price"));
      expect(price.x).toBeGreaterThanOrEqual(card.x);
      expect(price.x + price.width).toBeLessThanOrEqual(card.x + card.width);
      if (zoom === 1) {
        // With the text as set every word is whole: the price goes under
        // the timetable before it squeezes a name.
        expect(fit.brokenWords).toEqual([]);
        // Neither the screen nor the page scrolls sideways. At twice the
        // size the name line over the scene is wider than the screen, and
        // the labels of the tab bar than their tabs, which is the last
        // pass's to mend (plan, PR 12), not a ticket's: the ticket is
        // whole in the window at either size.
        expect(fit.screenWider).toBeLessThanOrEqual(0);
        const wider = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(wider).toBeLessThanOrEqual(0);
      } else {
        // Twice as large, a word longer than a whole line of its place can
        // only be broken: no other word is, and by then the price stands
        // under the timetable, so the place has all the room there is.
        expect(fit.needlessly).toEqual([]);
        expect(fit.brokenWords.length).toBeGreaterThan(0);
        expect(price.y).toBeGreaterThanOrEqual(to.y + to.height - 1);
      }
    });
  }
});
