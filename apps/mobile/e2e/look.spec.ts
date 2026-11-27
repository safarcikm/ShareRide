import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  soonestTripsRoute,
  type Booking,
  type Conversation,
  type Me,
  type MyTrip,
  type TripBookings,
  type TripDetails,
  type TripSearchResult,
} from "@shareride/contracts";
import { english, icelandic, signUp } from "./support/account";
import { confirmedBooking, requestSeat, secondPage } from "./support/cancelling";
import { menuFit, picturesUnderTheirText, textsToSee, ticketFit } from "./support/layout";
import { aPerson, personId, showPerson } from "./support/person";
import { openTrip } from "./support/trips";

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

/**
 * Text at 200% (WCAG 1.4.4), as a browser's text-only zoom sets it: the
 * text there is, and the text drawn after, as when a part of the screen
 * takes another place for the larger text.
 */
async function twiceAsLarge(page: Page) {
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

/** By how many pixels the page itself scrolls sideways. */
const pageWider = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

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
      if (zoom === 2) await twiceAsLarge(page);
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
      // Neither the screen nor the page scrolls sideways, at either size:
      // the name line over the scene and the menu's names stay in the window.
      expect(fit.screenWider).toBeLessThanOrEqual(0);
      expect(await pageWider(page)).toBeLessThanOrEqual(0);
      if (zoom === 1) {
        // With the text as set every word is whole: the price goes under
        // the timetable before it squeezes a name.
        expect(fit.brokenWords).toEqual([]);
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

// The same on a ride's own page (spec 31, 3.7): the title stands between
// Back and Share, and each end of the ticket has Change beside its place.
// The ride from the search is given long names on the way to its page.
test.describe("a ride's page with long place names, 360 wide", () => {
  test.use({ locale: "en-GB" });

  const getIn = "Kirkjubæjarklaustur, N1 við Skaftárskála";
  const getOut = "Keflavíkurflugvöllur, komusalur";

  for (const zoom of [1, 2] as const) {
    test(`holds its title and its ticket, with the text ${zoom === 1 ? "as set" : "twice as large"}`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "phone", "A phone's column; laptops have two.");
      await page.setViewportSize({ width: 360, height: 740 });
      await page.route(
        (url) => /^\/v1\/trips\/[0-9a-f-]{36}$/.test(url.pathname),
        async (route) => {
          const response = await route.fetch();
          if (!response.ok()) {
            await route.fulfill({ response });
            return;
          }
          const trip = (await response.json()) as TripDetails;
          const names = new Map([
            [trip.part.board, getIn],
            [trip.part.alight, getOut],
          ]);
          const stops = trip.stops.map((stop) => {
            const name = names.get(stop.position);
            return name === undefined
              ? stop
              : { ...stop, meetingPoint: { ...stop.meetingPoint, name: { is: name, en: name } } };
          });
          await route.fulfill({ response, json: { ...trip, stops } });
        },
      );
      await openTrip(page, {
        fromField: /^From: /,
        fromLabel: "From",
        from: "borgarn",
        fromPoint: /^N1 Borgarnes,/,
        toField: /^To: /,
        toLabel: "To",
        to: "blondu",
        toPoint: /^Olís Blönduós,/,
        search: "Find a ride",
        result: /^Leaves N1 Borgarnes at \d\d:\d\d, .*Anna, New driver/,
      });
      const ticket = page.getByTestId("part-ticket").filter({ visible: true });
      await expect(ticket.getByText(getIn)).toBeVisible();
      await expect(ticket.getByRole("button", { name: "Change where you get in" })).toBeVisible();
      await expect(ticket.getByRole("button", { name: "Change where you get out" })).toBeVisible();
      if (zoom === 2) await twiceAsLarge(page);

      // The title: whole in the window with Back and Share, and nothing past the head.
      const head = await ticketFit(page, "screen-head", "h1");
      expect(head.past).toEqual([]);
      expect(head.cut).toEqual([]);
      expect(head.beyondWindow).toBe(0);
      // The ticket: nothing past it, no place cut, whole in the window.
      const fit = await ticketFit(page, "part-ticket");
      expect(fit.past).toEqual([]);
      expect(fit.cut).toEqual([]);
      expect(fit.beyondWindow).toBe(0);
      // Each time stays on its place's first line.
      const from = await box(ticket.getByTestId("ticket-from-place"));
      const time = await box(ticket.getByTestId("ticket-time").first());
      expect(Math.abs(time.y - from.y)).toBeLessThan(8 * zoom);
      // The screen does not scroll sideways: "Get in" and "Get out" go
      // under their stops' names where they have no room beside them.
      expect(fit.screenWider).toBeLessThanOrEqual(0);
      if (zoom === 1) {
        // With the text as set every word is whole: Share goes over the
        // title, and Change under its place, before either squeezes a name.
        expect(head.brokenWords).toEqual([]);
        expect(fit.brokenWords).toEqual([]);
        // Where you sit: the words stand beside the car, also this narrow.
        const seats = page.getByTestId("where-you-sit").filter({ visible: true });
        const car = await box(seats.getByTestId("seat-view"));
        const words = await box(seats.getByRole("heading", { name: "Where you sit" }));
        expect(words.x).toBeGreaterThanOrEqual(car.x + car.width);
      } else {
        // Twice as large, only a word longer than a whole line is broken.
        expect(head.needlessly).toEqual([]);
        expect(fit.needlessly).toEqual([]);
      }
    });
  }
});

// And on a booked seat (spec 31, 3.8): the title beside Back, the ticket,
// Message beside a driver with a long name, and the small map beside where
// to stand. Dóra's booking is given the long names on its way to her page.
test.describe("a booked seat with long names, 360 wide", () => {
  test.use({ locale: "en-GB" });

  const getIn = "Kirkjubæjarklaustur, N1 við Skaftárskála";
  const getOut = "Keflavíkurflugvöllur, komusalur";
  const driverName = "Sigurbjörg Aðalheiður";
  const shown = { visible: true } as const;

  /** Gives the booking its long names on its way to the page. */
  async function withLongNames(page: Page) {
    await page.route(
      (url) => /^\/v1\/bookings\/[0-9a-f-]{36}$/.test(url.pathname),
      async (route) => {
        const response = await route.fetch();
        if (route.request().method() !== "GET" || !response.ok()) {
          await route.fulfill({ response });
          return;
        }
        const seat = (await response.json()) as Booking;
        const named = (name: string) => ({ is: name, en: name });
        const long: Booking = {
          ...seat,
          driver: { ...seat.driver, firstName: driverName },
          board: {
            ...seat.board,
            meetingPoint: { ...seat.board.meetingPoint, name: named(getIn) },
          },
          alight: {
            ...seat.alight,
            meetingPoint: { ...seat.alight.meetingPoint, name: named(getOut) },
          },
        };
        await route.fulfill({ response, json: long });
      },
    );
  }

  test("holds its title, its ticket, the driver and where to stand, with the text as set and twice as large", async ({
    page: driver,
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "A phone's column; laptops have two.");
    test.slow();
    const { page, close } = await secondPage(browser, testInfo);
    const { booking } = await confirmedBooking(driver, page);
    await page.setViewportSize({ width: 360, height: 740 });
    await withLongNames(page);
    await page.goto(booking);
    const ticket = page.getByTestId("booking-ticket").filter(shown);
    await expect(ticket.getByText(getIn)).toBeVisible();
    const message = page.getByRole("link", { name: `Message ${driverName}` }).filter(shown);
    await expect(message).toBeVisible();

    for (const zoom of [1, 2] as const) {
      if (zoom === 2) await twiceAsLarge(page);
      // Each part is whole in the window, with nothing past its edges and
      // no text cut.
      const head = await ticketFit(page, "screen-head", "h1");
      const seat = await ticketFit(page, "booking-ticket");
      const stand = await ticketFit(page, "where-to-stand", "[dir]");
      for (const part of [head, seat, stand]) {
        expect(part.cut).toEqual([]);
        expect(part.beyondWindow).toBe(0);
      }
      expect(head.past).toEqual([]);
      expect(seat.past).toEqual([]);
      // Where to stand holds its small map, which cuts the country around
      // the stop to its own frame, and "Open in maps".
      const place = page.getByTestId("where-to-stand").filter(shown);
      const frame = await box(place);
      for (const inside of [place.getByTestId("iceland-map"), place.getByRole("link")]) {
        const part = await box(inside);
        expect(part.x).toBeGreaterThanOrEqual(frame.x - 1);
        expect(part.x + part.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
      }
      // The driver: the name is whole, and Message stands inside the card,
      // beside the driver or under them.
      const who = await ticketFit(page, "driver-card", "[dir]");
      expect(who.cut).toEqual([]);
      expect(who.beyondWindow).toBe(0);
      const card = await box(page.getByTestId("driver-card").filter(shown));
      const button = await box(message);
      expect(button.x).toBeGreaterThanOrEqual(card.x - 1);
      expect(button.x + button.width).toBeLessThanOrEqual(card.x + card.width + 1);
      // The road names its steps, or says the one it is at in a line: no
      // name stands over another or past the road.
      const steps = await textsToSee(
        page.getByRole("img", { name: /^Step \d of 4: / }).filter(shown),
      );
      expect(steps.shown.length).toBeGreaterThan(0);
      expect(steps.over).toEqual([]);
      expect(steps.past).toEqual([]);
      // The screen does not scroll sideways.
      expect(seat.screenWider).toBeLessThanOrEqual(0);
      if (zoom === 1) {
        // With the text as set every word is whole.
        for (const part of [head, seat, stand, who]) expect(part.brokenWords).toEqual([]);
        // Where to stand: the place stands beside the small map.
        const map = await box(place.getByTestId("iceland-map"));
        const name = await box(place.getByText(getIn));
        expect(name.x).toBeGreaterThanOrEqual(map.x + map.width);
      } else {
        // Twice as large, only a word longer than a whole line is broken.
        for (const part of [head, seat, stand, who]) expect(part.needlessly).toEqual([]);
      }
    }
    await close();
  });

  // Cancelling it (spec 31, 3.19): the title, the ticket and the reasons
  // in the column, and in the bar the red button over the one that keeps
  // the booking, each whole in the window.
  test("holds the screen that cancels it, with the two buttons of its bar, with the text as set and twice as large", async ({
    page: driver,
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "A phone's column and bar.");
    test.slow();
    const { page, close } = await secondPage(browser, testInfo);
    const { booking } = await confirmedBooking(driver, page);
    const window = { width: 360, height: 740 };
    await page.setViewportSize(window);
    await withLongNames(page);
    await page.goto(`${booking}/cancel`);
    await expect(page.getByRole("heading", { name: "Cancel your booking" })).toBeVisible();
    const bar = page.getByTestId("bottom-bar").filter(shown);
    const cancel = bar.getByRole("button", { name: "Cancel booking", exact: true });
    const keep = bar.getByRole("button", { name: "Keep my booking" });
    await expect(keep).toBeVisible();

    for (const zoom of [1, 2] as const) {
      if (zoom === 2) await twiceAsLarge(page);
      const head = await ticketFit(page, "screen-head", "h1");
      const seat = await ticketFit(page, "booking-ticket");
      for (const part of [head, seat]) {
        expect(part.cut).toEqual([]);
        expect(part.past).toEqual([]);
        expect(part.beyondWindow).toBe(0);
        expect(part.screenWider).toBeLessThanOrEqual(0);
      }
      // The reasons wrap inside the column.
      const reasons = await box(page.getByRole("radiogroup").filter(shown));
      expect(reasons.x).toBeGreaterThanOrEqual(0);
      expect(reasons.x + reasons.width).toBeLessThanOrEqual(window.width);
      // The bar: the red button over Keep, both whole in the window and
      // in view, with their labels whole.
      const red = await box(cancel);
      const kept = await box(keep);
      for (const button of [red, kept]) {
        expect(button.x).toBeGreaterThanOrEqual(0);
        expect(button.x + button.width).toBeLessThanOrEqual(window.width);
        expect(button.y + button.height).toBeLessThanOrEqual(window.height);
      }
      expect(kept.y).toBeGreaterThanOrEqual(red.y + red.height);
      const buttons = await ticketFit(page, "bottom-bar", "[dir]");
      expect(buttons.cut).toEqual([]);
      expect(buttons.past).toEqual([]);
      if (zoom === 1) {
        expect(head.brokenWords).toEqual([]);
        expect(buttons.brokenWords).toEqual([]);
        // The title is in view over the bar: the bar leaves room for the page.
        const title = await box(page.getByRole("heading", { name: "Cancel your booking" }));
        const top = await box(bar);
        expect(title.y + title.height).toBeLessThan(top.y);
      } else {
        expect(head.needlessly).toEqual([]);
        expect(buttons.needlessly).toEqual([]);
      }
    }
    // Why nothing was cancelled stands over the red button, in view.
    await cancel.click();
    const why = bar.getByRole("alert");
    await expect(why).toHaveText("Choose a reason.");
    const said = await box(why);
    const red = await box(cancel);
    expect(said.y).toBeGreaterThanOrEqual(0);
    expect(said.y + said.height).toBeLessThanOrEqual(red.y + 1);
    await close();
  });

  // Its conversation (spec 31, 3.13): the top, with Back, the driver's
  // name and car and the menu's button, and the ride as one line that
  // wraps; in the bar the field with Send beside it; and room left for the
  // messages between them. With the text as set the top stays; twice as
  // large it would fill the window, so it scrolls with the conversation.
  test("holds its conversation's top, the ride's line and the field with Send, and leaves the messages room, with the text as set and twice as large", async ({
    page: driver,
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "A phone's column and bar.");
    test.slow();
    const { page, close } = await secondPage(browser, testInfo);
    const { booking } = await confirmedBooking(driver, page);
    const window = { width: 360, height: 740 };
    await page.setViewportSize(window);
    // The conversation comes with its booking.
    await page.route(
      (url) => /^\/v1\/bookings\/[0-9a-f-]{36}\/messages$/.test(url.pathname),
      async (route) => {
        const response = await route.fetch();
        if (route.request().method() !== "GET" || !response.ok()) {
          await route.fulfill({ response });
          return;
        }
        const answer = (await response.json()) as { conversation: Conversation };
        const seat = answer.conversation.booking;
        const named = (name: string) => ({ is: name, en: name });
        const long: Booking = {
          ...seat,
          driver: { ...seat.driver, firstName: driverName },
          board: {
            ...seat.board,
            meetingPoint: { ...seat.board.meetingPoint, name: named(getIn) },
          },
          alight: {
            ...seat.alight,
            meetingPoint: { ...seat.alight.meetingPoint, name: named(getOut) },
          },
        };
        await route.fulfill({
          response,
          json: { ...answer, conversation: { ...answer.conversation, booking: long } },
        });
      },
    );
    await page.goto(`/messages/${booking.split("/").at(-1) ?? ""}`);
    const top = page.getByTestId("conversation-head").filter(shown);
    await expect(top.getByRole("heading", { name: driverName })).toBeVisible();
    const ride = top.getByRole("link", { name: `, ${getIn} to ${getOut}` });
    await expect(ride).toBeVisible();
    const more = top.getByRole("button", { name: "More", exact: true });
    const staying = page.getByTestId("screen-top-bar").filter(shown);
    const reading = page.getByTestId("screen-scroll").filter(shown);
    const bar = page.getByTestId("bottom-bar").filter(shown);
    const field = bar.getByLabel("Write a message");
    const send = bar.getByRole("button", { name: "Send", exact: true });

    for (const zoom of [1, 2] as const) {
      if (zoom === 2) await twiceAsLarge(page);
      // The top stays while the rest keeps room; twice as large it is the
      // first thing in the conversation.
      await expect(staying).toHaveCount(zoom === 1 ? 1 : 0);
      const head = await ticketFit(page, "conversation-head", "[dir]");
      expect(head.cut).toEqual([]);
      expect(head.past).toEqual([]);
      expect(head.beyondWindow).toBe(0);
      expect(head.screenWider).toBeLessThanOrEqual(0);
      // The menu's button and the ride's line are whole in the window's width.
      for (const part of [await box(more), await box(ride)]) {
        expect(part.x).toBeGreaterThanOrEqual(0);
        expect(part.x + part.width).toBeLessThanOrEqual(window.width);
      }
      // The bar: the field, and Send at its right, whole in the window.
      const written = await box(field);
      const button = await box(send);
      expect(written.x).toBeGreaterThanOrEqual(0);
      expect(button.x).toBeGreaterThanOrEqual(written.x + written.width);
      expect(button.x + button.width).toBeLessThanOrEqual(window.width);
      expect(button.y + button.height).toBeLessThanOrEqual(window.height);
      // The messages keep a third of the window, between the top or the
      // window's own and the quick messages.
      const room = await box(reading);
      expect(room.height).toBeGreaterThanOrEqual(window.height / 3);
      // The picture stands with the top of the name, which has two lines.
      expect((await picturesUnderTheirText(page)).under).toEqual([]);
      if (zoom === 1) expect(head.brokenWords).toEqual([]);
      else expect(head.needlessly).toEqual([]);
    }
    // With its top in it the conversation is taller than its room, and is at its end.
    const fromEnd = () =>
      reading.evaluate((scroll) => scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight);
    expect(
      await reading.evaluate((scroll) => scroll.scrollHeight - scroll.clientHeight),
    ).toBeGreaterThan(0);
    await expect.poll(fromEnd).toBeLessThanOrEqual(1);
    const room = await box(reading);
    // A line written twice as large is whole in the field, which has grown
    // for it. (From about five lines of text as set, it scrolls inside.)
    await field.fill("Skis too?");
    await expect
      .poll(() => field.evaluate((written) => written.scrollHeight - written.clientHeight))
      .toBeLessThanOrEqual(1);
    const written = await box(field);
    expect(written.y + written.height).toBeLessThanOrEqual(window.height);
    // The field took of the conversation's room, and the last message did
    // not go under the bar: the conversation is still at its end.
    await expect.poll(async () => (await box(reading)).height).toBeLessThan(room.height);
    await expect.poll(fromEnd).toBeLessThanOrEqual(1);
    await close();
  });
});

// And on a ride I drive (spec 31, 3.12): the title beside Back, the ticket
// with sharing in its corner, a request with the part it asks for and its
// two answers, a passenger's row with Message beside it, and the seats
// with where the ride is fullest. The ride and its bookings are given the
// long names on their way to the driver's page.
test.describe("a ride I drive with long names, 360 wide", () => {
  test.use({ locale: "en-GB" });

  // One for each stop of the ride to Selfoss, with those suggested on the way.
  const places = [
    "Kirkjubæjarklaustur, N1 við Skaftárskála",
    "Vík í Mýrdal, Víkurskáli við þjóðveginn",
    "Hvolsvöllur, Hlíðarendi við Austurveg",
    "Keflavíkurflugvöllur, komusalur",
    "Seyðisfjörður, ferjuhöfnin við Ferjuleiru",
  ] as const;
  const people = new Map([
    ["Dóra", "Sigurbjörg Aðalheiður"],
    ["Einar", "Guðmundur Kristján"],
  ]);
  const shown = { visible: true } as const;

  /** A stop's long name, by its place in the ride. */
  function long<Stop extends { readonly meetingPoint: { readonly name: object } }>(
    stop: Stop,
    position: number,
  ): Stop {
    const name = places[position];
    if (name === undefined) throw new Error(`No long name for stop ${String(position)}`);
    return { ...stop, meetingPoint: { ...stop.meetingPoint, name: { is: name, en: name } } };
  }

  /** Gives the ride and the people on it their long names on the way to the page. */
  async function withLongNames(page: Page) {
    await page.route(
      (url) => /^\/v1\/me\/trips\/[0-9a-f-]{36}(\/bookings)?$/.test(url.pathname),
      async (route) => {
        const response = await route.fetch();
        if (route.request().method() !== "GET" || !response.ok()) {
          await route.fulfill({ response });
          return;
        }
        if (!route.request().url().endsWith("/bookings")) {
          const trip = (await response.json()) as MyTrip;
          await route.fulfill({ response, json: { ...trip, stops: trip.stops.map(long) } });
          return;
        }
        const answer = (await response.json()) as TripBookings;
        const bookings = answer.bookings.map((booking) => ({
          ...booking,
          passenger: {
            ...booking.passenger,
            firstName: people.get(booking.passenger.firstName ?? "") ?? null,
          },
          board: long(booking.board, booking.board.position),
          alight: long(booking.alight, booking.alight.position),
        }));
        await route.fulfill({ response, json: { ...answer, bookings } });
      },
    );
  }

  test("holds its title, its ticket, a request, a passenger and its seats, with the text as set and twice as large", async ({
    page,
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "A phone's column; laptops have two.");
    test.slow();
    const dora = await secondPage(browser, testInfo);
    const einar = await secondPage(browser, testInfo);
    const { tripId } = await confirmedBooking(page, dora.page);
    await requestSeat(einar.page, "Einar", tripId);
    const window = { width: 360, height: 740 };
    await page.setViewportSize(window);
    await withLongNames(page);
    await page.goto(`/drive/trips/${tripId}`);
    const ticket = page.getByTestId("driver-ride-ticket").filter(shown);
    await expect(ticket.getByText(places[0])).toBeVisible();
    const share = page.getByRole("button", { name: "Share this ride" }).filter(shown);
    const request = page.getByTestId("request").filter(shown);
    const accept = request.getByRole("button", { name: "Accept", exact: true });
    const decline = request.getByRole("button", { name: "Decline", exact: true });
    await expect(accept).toBeVisible();
    await expect(request.getByText("“One small bag.”")).toBeVisible();
    const row = page.getByTestId("passenger-row").filter(shown);
    const message = row.getByRole("button", { name: "Message Sigurbjörg Aðalheiður" });
    await expect(message).toBeVisible();
    await expect(page.getByTestId("seats-card").filter(shown)).toContainText("2 of 3 taken");

    for (const zoom of [1, 2] as const) {
      if (zoom === 2) await twiceAsLarge(page);
      // Each part is whole in the window, with nothing past its edges and
      // no text cut.
      const head = await ticketFit(page, "screen-head", "h1");
      const ride = await ticketFit(page, "driver-ride-ticket");
      // The request's card: the tint of the link to who asks reaches a
      // little past the request itself, inside the card.
      const asked = await ticketFit(page, "needs-you-card", "[dir]");
      const aboard = await ticketFit(page, "passengers", "[dir]");
      const seats = await ticketFit(page, "seats-card", "[dir]");
      const parts = [head, ride, asked, aboard, seats];
      for (const part of parts) {
        expect(part.cut).toEqual([]);
        expect(part.past).toEqual([]);
        expect(part.beyondWindow).toBe(0);
      }
      // Sharing stands in the ticket's corner, inside it.
      const card = await box(ticket);
      const corner = await box(share);
      expect(corner.x).toBeGreaterThanOrEqual(card.x);
      expect(corner.x + corner.width).toBeLessThanOrEqual(card.x + card.width + 1);
      // The request's two answers are whole in the window, each with its label whole.
      for (const answer of [accept, decline]) {
        const button = await box(answer);
        expect(button.x).toBeGreaterThanOrEqual(0);
        expect(button.x + button.width).toBeLessThanOrEqual(window.width);
      }
      // Message stands inside the passenger's row, beside their name.
      const line = await box(row);
      const button = await box(message);
      expect(button.x).toBeGreaterThanOrEqual(line.x);
      expect(button.x + button.width).toBeLessThanOrEqual(line.x + line.width + 1);
      // The screen does not scroll sideways.
      expect(ride.screenWider).toBeLessThanOrEqual(0);
      if (zoom === 1) {
        // With the text as set every word is whole.
        for (const part of parts) expect(part.brokenWords).toEqual([]);
      } else {
        // Twice as large, only a word longer than a whole line is broken.
        for (const part of parts) expect(part.needlessly).toEqual([]);
      }
    }
    await dora.close();
    await einar.close();
  });
});

// Spec 31, 3.14: Profile on the narrowest phone the app is made for, in
// Icelandic, whose words are longer, for someone with a long name and a
// long email.
test.describe("Profile with a long name, 360 wide", () => {
  test.use({ locale: "en-GB" });

  const longName = "Sigurbjörg Aðalheiður";
  const longEmail = "sigurbjorg.adalheidur.gudmundsdottir@example.com";
  const shown = { visible: true } as const;

  test("holds who I am with Edit, the photo's controls and every row with what is set, with the text as set and twice as large", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "A phone's column; laptops have two.");
    test.slow();
    await page.setViewportSize({ width: 360, height: 740 });
    await signUp(page, english, "Anna");
    // The account's long name and email, on their way to the page.
    await page.route(
      (url) => url.pathname === "/v1/me",
      async (route) => {
        const response = await route.fetch();
        if (!["GET", "PATCH"].includes(route.request().method()) || !response.ok()) {
          await route.fulfill({ response });
          return;
        }
        const me = (await response.json()) as Me;
        await route.fulfill({ response, json: { ...me, firstName: longName, email: longEmail } });
      },
    );
    // The language is chosen on its own page.
    await page.goto("/settings/language");
    await page.getByRole("radio", { name: "Íslenska" }).filter(shown).click();
    await expect(
      page.getByRole("heading", { name: "Tungumál", exact: true }).filter(shown),
    ).toBeVisible();
    await page.goto("/profile");
    const card = page.getByTestId("person-card").filter(shown);
    await expect(card.getByText(longName)).toBeVisible();
    await expect(card.getByTestId("person-card-standing")).toBeVisible();
    await expect(
      page.getByRole("link", { name: `Netfang, ${longEmail}` }).filter(shown),
    ).toBeVisible();
    const groups = page.getByTestId("action-rows").filter(shown);
    await expect(groups).toHaveCount(5);

    for (const zoom of [1, 2] as const) {
      if (zoom === 2) await twiceAsLarge(page);
      // The card is whole in the window, with nothing past its edges and
      // no text cut, and Edit inside it, beside the name or under it.
      const who = await ticketFit(page, "person-card", "[dir]");
      // Only the face of the photo's first button starts in the card's
      // padding, so that its words start where the lines do (below).
      const photoButton = ["Bæta við mynd", "button-face"];
      expect(who.past.filter((part) => !photoButton.includes(part))).toEqual([]);
      expect(who.cut).toEqual([]);
      expect(who.beyondWindow).toBe(0);
      const frame = await box(card);
      const edit = await box(card.getByRole("button", { name: "Breyta prófíl" }));
      expect(edit.x).toBeGreaterThanOrEqual(frame.x);
      expect(edit.x + edit.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
      // The picture stands with the name, not at the middle of the lines.
      expect((await picturesUnderTheirText(page)).under).toEqual([]);
      // The photo's first button starts where the card's other lines do.
      const add = await box(card.getByText("Bæta við mynd", { exact: true }));
      const preview = await box(card.getByText("Sjáðu hvernig aðrir sjá þig", { exact: true }));
      expect(Math.abs(add.x - preview.x)).toBeLessThanOrEqual(1);
      // Each group of rows is whole in the window, with no text cut and
      // nothing past its edges: a value with no room beside its title
      // stands under it.
      const rows = [];
      for (let nth = 0; nth < 5; nth += 1) {
        rows.push(await ticketFit(page, "action-rows", "[dir]", nth));
      }
      for (const group of rows) {
        expect(group.past).toEqual([]);
        expect(group.cut).toEqual([]);
        expect(group.beyondWindow).toBe(0);
        // Only a word longer than a whole line is broken, as the email is.
        expect(group.needlessly).toEqual([]);
      }
      expect(who.needlessly).toEqual([]);
      // Neither the screen nor the page scrolls sideways: the menu's names
      // stay in their places.
      expect(who.screenWider).toBeLessThanOrEqual(0);
      expect(await pageWider(page)).toBeLessThanOrEqual(0);
      // With the text as set every word of the card is whole.
      if (zoom === 1) expect(who.brokenWords).toEqual([]);
    }
  });
});

// Spec 31, 3.19: a person's profile on the narrowest phone the app is made
// for, in Icelandic, whose words are longer, for someone with a long name
// who wrote a lot about herself and speaks four languages. All made up.
test.describe("A person's profile with a long name, 360 wide", () => {
  test.use({ locale: "en-GB" });

  const longName = "Sigurbjörg Aðalheiður";
  const shown = { visible: true } as const;
  const person = aPerson({
    firstName: longName,
    languages: ["is", "en", "pl", "de"],
    about:
      "Ég keyri á milli Reykjavíkur og Akureyrar flestar helgar, með hundinn í aftursætinu. Spjalla gjarnan á leiðinni, eða þegi ef þú vilt sofa.",
    rating: { average: 4.3, count: 12 },
  });

  test("holds its head, the person's card, the figure's row and the rows that report and block, with the text as set and twice as large", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "A phone's column; a laptop has room.");
    test.slow();
    await page.setViewportSize({ width: 360, height: 740 });
    await signUp(page, english, "Anna");
    await showPerson(page, person);
    // The language is chosen on its own page.
    await page.goto("/settings/language");
    await page.getByRole("radio", { name: "Íslenska" }).filter(shown).click();
    await expect(
      page.getByRole("heading", { name: "Tungumál", exact: true }).filter(shown),
    ).toBeVisible();
    await page.goto(`/people/${personId}`);
    await expect(
      page.getByRole("heading", { name: "Prófíll", exact: true }).filter(shown),
    ).toBeVisible();
    const card = page.getByTestId("person-card").filter(shown);
    await expect(card.getByText(longName, { exact: true })).toBeVisible();
    // The rating and both checks are on the card's one line, which wraps.
    const standing = card.getByTestId("person-card-standing");
    await expect(standing.getByText("Símanúmer staðfest")).toBeVisible();
    await expect(standing.getByText("Netfang staðfest")).toBeVisible();
    // The figure's row, then, after the reviews, the rules, Report and Block.
    const rows = page.getByTestId("action-rows").filter(shown);
    await expect(rows).toHaveCount(2);
    const block = rows.nth(1).getByRole("link", { name: `Loka á: ${longName}` });
    await expect(block).toBeVisible();
    await expect(rows.nth(1).getByRole("link")).toHaveCount(3);

    for (const zoom of [1, 2] as const) {
      if (zoom === 2) await twiceAsLarge(page);
      // Each part is whole in the window, with nothing past its edges and
      // no text cut; a name with no room on a row's line goes on with the
      // next, and only a word longer than a whole line is broken.
      const head = await ticketFit(page, "screen-head", "h1");
      const who = await ticketFit(page, "person-card", "[dir]");
      const figure = await ticketFit(page, "action-rows", "[dir]", 0);
      const safety = await ticketFit(page, "action-rows", "[dir]", 1);
      for (const part of [head, who, figure, safety]) {
        expect(part.past).toEqual([]);
        expect(part.cut).toEqual([]);
        expect(part.beyondWindow).toBe(0);
        expect(part.needlessly).toEqual([]);
      }
      // The picture stands with the name, not at the middle of the lines.
      expect((await picturesUnderTheirText(page)).under).toEqual([]);
      // Block is the last row of the page's last card.
      const last = await box(rows.nth(1));
      const blockRow = await box(block);
      expect(blockRow.y + blockRow.height).toBeGreaterThanOrEqual(last.y + last.height - 2);
      // The screen does not scroll sideways.
      expect(who.screenWider).toBeLessThanOrEqual(0);
      if (zoom === 1) {
        // With the text as set every word is whole.
        for (const part of [head, who, figure, safety]) expect(part.brokenWords).toEqual([]);
      }
    }
    // Unfolded, twice as large, the counts behind the figure are whole in its card.
    await rows.nth(0).getByRole("button").click();
    await expect(rows.nth(0).getByRole("button")).toHaveAttribute("aria-expanded", "true");
    const counts = await ticketFit(page, "action-rows", "[dir]", 0);
    expect(counts.past).toEqual([]);
    expect(counts.cut).toEqual([]);
    expect(counts.beyondWindow).toBe(0);
  });
});

// The last pass (plan, PR 12b): what every screen of the menu shares, on
// the narrowest phone the app is made for, with the text as set and twice
// as large (WCAG 1.4.4).
test.describe("the menu, Find's name line and the road, 360 wide", () => {
  const window = { width: 360, height: 740 };
  const shown = { visible: true } as const;

  for (const texts of [english, icelandic]) {
    test.describe(texts === english ? "in English" : "in Icelandic", () => {
      test.use({ locale: texts === english ? "en-GB" : "is-IS" });

      test("the menu keeps each name in its own place and its icons in a line, and Find's name line stays in the window", async ({
        page,
      }, testInfo) => {
        test.skip(testInfo.project.name !== "phone", "Wide screens have the top bar.");
        await signUp(page, texts, "Anna");
        await page.setViewportSize(window);
        for (const zoom of [1, 2] as const) {
          if (zoom === 2) await twiceAsLarge(page);
          // Each place's name is inside its place, no place stands over
          // another, and the icons of a row are level, whatever lines the
          // names take ("Ferðirnar mínar" has two as set).
          const menu = await menuFit(page);
          expect(menu.places).toBe(5);
          expect(menu.namesPast).toEqual([]);
          expect(menu.over).toEqual([]);
          expect(menu.iconsOffLine).toEqual([]);
          expect(menu.beyondWindow).toBe(0);
          // Find's name line: the name, Beta and the language, each whole
          // in the window.
          const top = await ticketFit(page, "scene-top", "[dir]");
          expect(top.past).toEqual([]);
          expect(top.cut).toEqual([]);
          expect(top.beyondWindow).toBe(0);
          expect(top.screenWider).toBeLessThanOrEqual(0);
          expect(await pageWider(page)).toBeLessThanOrEqual(0);
        }
      });
    });
  }

  test.describe("offering a ride", () => {
    test.use({ locale: "en-GB" });

    test("the road names its steps under their marks, and says the step in one line where they have no room", async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "phone", "A phone's column.");
      await signUp(page, english, "Anna");
      await page.setViewportSize(window);
      await page.goto("/offer");
      await expect(page.getByRole("heading", { name: "Where are you driving?" })).toBeVisible();
      const road = page.getByRole("img", { name: "Step 1 of 5: Route" }).filter(shown);
      await expect(road).toBeVisible();
      const set = await textsToSee(road);
      expect(set.shown).toEqual(["Route", "Time", "Seats", "Price", "Check"]);
      expect(set.over).toEqual([]);
      expect(set.past).toEqual([]);

      // Twice as large the five names have no room: what a screen reader
      // hears stands under the road, for the eye.
      await twiceAsLarge(page);
      await expect(road.getByText("Step 1 of 5: Route")).toBeVisible();
      const large = await textsToSee(road);
      expect(large.shown).toEqual(["Step 1 of 5: Route"]);
      expect(large.over).toEqual([]);
      expect(large.past).toEqual([]);
      const head = await ticketFit(page, "screen-head", "h1");
      expect(head.screenWider).toBeLessThanOrEqual(0);
      expect(await pageWider(page)).toBeLessThanOrEqual(0);
    });
  });
});
