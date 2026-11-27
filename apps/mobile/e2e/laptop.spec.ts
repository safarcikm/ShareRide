import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import {
  soonestTripsMaxLimit,
  soonestTripsRoute,
  type TripSearchResult,
} from "@shareride/contracts";
import { maxContentWidth } from "@shareride/ui";
import { apiUrl } from "../playwright.config";
import { english, signUp } from "./support/account";
import { passengerRow } from "./support/driver-ride";
import { expectNoSidewaysScroll, laptop, widths } from "./support/laptop";
import { addPhotoBeforePublishing } from "./support/photo";
import { chooseTime, postTripToSelfoss, tomorrow } from "./support/trips";

// The web app on a laptop (spec 18): the top bar's content lines up with the
// page, the logo opens Find, and no screen scrolls sideways at the widths a
// laptop window has. Each wide screen joins here as it is built.

test.skip(({ isMobile }) => isMobile, "Laptop windows; phones have their own journeys.");

/** Screens anyone can open, by the heading that shows they are ready. */
const open = [
  { path: "/", heading: "Share your ride" },
  { path: "/meeting-points", heading: "Meeting points" },
  { path: "/profile", heading: "Profile" },
] as const;

for (const width of widths) {
  test.describe(`a window ${String(width)} wide`, () => {
    test.use({ viewport: laptop(width), locale: "en-GB" });

    test("shows the top bar, and no screen scrolls sideways", async ({ page }) => {
      for (const { path, heading } of open) {
        await page.goto(path);
        await expect(
          page.getByRole("heading", { name: heading }).filter({ visible: true }),
        ).toBeVisible();
        await expect(page.getByTestId("top-bar")).toBeVisible();
        await expectNoSidewaysScroll(page);
      }
    });
  });
}

test.describe("the narrowest wide window, in Icelandic", () => {
  test.use({ viewport: laptop(widths[0]), locale: "is-IS" });

  test("holds the whole top bar, with its longer words", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Verum samferða" })).toBeVisible();
    await expect(
      page.getByTestId("top-bar").getByRole("button", { name: "Skipta yfir í ensku" }),
    ).toBeVisible();
    await expectNoSidewaysScroll(page);
  });
});

test.describe("the top bar", () => {
  test.use({ viewport: laptop(1440), locale: "en-GB" });

  test("lines its logo and its language up with the page's edges", async ({ page }) => {
    await page.goto("/meeting-points");
    const bar = page.getByTestId("top-bar");
    const home = bar.getByRole("link", { name: "PuffinRide, to the front page" });
    await expect(home).toBeVisible();
    // A page is 1144 wide in the middle of the window: from 148 to 1292.
    const logo = await home.boundingBox();
    expect(logo?.x).toBeCloseTo(148, 0);
    const language = await bar.getByText("Íslenska").boundingBox();
    expect((language?.x ?? 0) + (language?.width ?? 0)).toBeCloseTo(1292, 0);
    // The page under it keeps room for a scrollbar at both sides, so it
    // stays in the middle where a scrollbar takes room.
    await expect(page.getByTestId("screen-scroll").filter({ visible: true })).toHaveCSS(
      "scrollbar-gutter",
      "stable both-edges",
    );
  });

  test("opens Find from the logo", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
    await page
      .getByTestId("top-bar")
      .getByRole("link", { name: "PuffinRide, to the front page" })
      .click();
    await expect(page.getByRole("heading", { name: "Share your ride" })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });
});

/** Where a part sits on the page; it must be visible. */
async function box(target: Locator) {
  const found = await target.boundingBox();
  if (found === null) throw new Error(`${target.toString()} is not visible`);
  return found;
}

const findTexts = {
  "en-GB": {
    title: "Share your ride",
    from: /^From: /,
    date: /^Date: /,
    find: "Find a ride",
    rideOnMap: /^The ride on a map of Iceland: .+ → .+\.$/,
    meetingPoints: "See the meeting points",
    offer: "Offer a ride",
    how: "How it works",
    soon: "Leaving soon",
    filters: "Filters",
  },
  "is-IS": {
    title: "Verum samferða",
    from: /^Frá: /,
    date: /^Dagsetning: /,
    find: "Finna far",
    rideOnMap: /^Ferðin á korti af Íslandi: .+ → .+\.$/,
    meetingPoints: "Skoða mótsstaði",
    offer: "Bjóða far",
    how: "Svona virkar þetta",
    soon: "Á leiðinni bráðum",
    filters: "Síur",
  },
} as const;

// Find (spec 18, 3.5; spec 31, 3.16): the title at the left of the scene with
// the car at its right, the search in one row across the page, the rides in
// a grid, and beside them "How it works" with the offer, then the map.
for (const locale of ["en-GB", "is-IS"] as const) {
  const texts = findTexts[locale];

  test.describe(`Find, ${locale}`, () => {
    test.use({ locale });

    for (const width of widths) {
      test(`keeps the whole search in its card, ${String(width)} wide`, async ({ page }) => {
        await page.setViewportSize(laptop(width));
        await page.goto("/");
        await expect(page.getByRole("heading", { name: texts.title })).toBeVisible();
        const row = page.getByTestId("search-row");
        const card = await box(row);
        const from = await box(row.getByRole("button", { name: texts.from }));
        const date = await box(row.getByRole("button", { name: texts.date }));
        const find = await box(row.getByRole("button", { name: texts.find, exact: true }));
        // Find a ride ends the row, and the date and the button share a line.
        expect(find.x + find.width).toBeCloseTo(card.x + card.width, 0);
        expect(date.y).toBeLessThan(find.y + find.height);
        expect(find.y).toBeLessThan(date.y + date.height);
        if (width >= 1280) {
          // A page at its full width holds it all on one line.
          expect(find.y).toBeLessThan(from.y + from.height);
        }
        // No word is cut: every text of the row is as wide as it needs.
        const cut = await row.evaluate((part) =>
          [...part.querySelectorAll<HTMLElement>("[dir]")]
            .filter((text) => text.scrollWidth > text.clientWidth + 1)
            .map((text) => text.textContent),
        );
        expect(cut).toEqual([]);
        // From, To and the date are fields: each value in a box of its own.
        const fields = row.getByTestId("search-field");
        await expect(fields).toHaveCount(3);
        for (const field of await fields.all()) {
          const one = await box(field);
          expect(one.x).toBeGreaterThanOrEqual(card.x);
          expect(one.x + one.width).toBeLessThanOrEqual(card.x + card.width);
        }
        await expectNoSidewaysScroll(page);
      });

      test(`has How it works and the map beside the rides, ${String(width)} wide`, async ({
        page,
      }) => {
        await page.setViewportSize(laptop(width));
        await page.goto("/");
        const main = page.getByTestId("columns-main");
        const side = page.getByTestId("columns-side");
        await expect(main.getByTestId("trip-result").first()).toBeVisible();
        // The title and its line stand at the left of the scene, clear of
        // the car that drives at its right.
        const line = page.getByTestId("title-line");
        const car = await box(line.getByTestId("car-on-hills"));
        const scene = await box(line);
        expect(car.x + car.width).toBeLessThanOrEqual(scene.x + scene.width);
        for (const text of await line.locator("[dir]").all()) {
          const words = await box(text);
          expect(words.x).toBeGreaterThanOrEqual(scene.x);
          expect(words.x + words.width).toBeLessThanOrEqual(car.x);
        }
        // And no word of them is cut to stay clear of it.
        const cutTitle = await line.evaluate((part) =>
          [...part.querySelectorAll<HTMLElement>("[dir]")]
            .filter((text) => text.scrollWidth > text.clientWidth + 1)
            .map((text) => text.textContent),
        );
        expect(cutTitle).toEqual([]);
        // The map shows a ride from the start, whole in its column, which
        // starts level with the rides'.
        const map = side.getByTestId("iceland-map");
        await expect(map).toHaveAccessibleName(texts.rideOnMap);
        const rides = await box(main);
        const column = await box(side);
        const drawn = await box(map);
        expect(column.x).toBeGreaterThan(rides.x + rides.width);
        expect(column.y).toBeCloseTo(rides.y, 0);
        expect(drawn.x).toBeGreaterThanOrEqual(column.x);
        expect(drawn.x + drawn.width).toBeLessThanOrEqual(column.x + column.width + 1);
        expect(drawn.width).toBeGreaterThan(300);
        // "How it works" stands over it: its card starts where the first row
        // of tickets does, under the headings' row, and no word in it is cut.
        const how = side.getByTestId("how-it-works");
        await expect(how.getByRole("heading", { name: texts.how })).toBeVisible();
        // The two headings are level, with "See all rides" beside the rides'
        // or without it.
        const overSteps = await box(how.getByRole("heading", { name: texts.how }));
        const overRides = await box(main.getByRole("heading", { name: texts.soon }));
        expect(overSteps.y + overSteps.height / 2).toBeCloseTo(
          overRides.y + overRides.height / 2,
          0,
        );
        const firstCard = await box(main.getByTestId("card").first());
        const steps = await box(how.getByTestId("card"));
        expect(steps.y).toBeCloseTo(firstCard.y, 0);
        expect(steps.x).toBeCloseTo(column.x, 0);
        expect(drawn.y).toBeGreaterThan(steps.y + steps.height);
        const cut = await how.evaluate((part) =>
          [...part.querySelectorAll<HTMLElement>("[dir]")]
            .filter((text) => text.scrollWidth > text.clientWidth + 1)
            .map((text) => text.textContent),
        );
        expect(cut).toEqual([]);
        // Every meeting point is a dot on it: far more than a ride's two ends.
        await expect.poll(() => map.locator("circle").count()).toBeGreaterThan(10);
        const points = await box(side.getByRole("link", { name: texts.meetingPoints }));
        expect(points.y).toBeGreaterThan(drawn.y + drawn.height - 1);
        expect(points.x + points.width).toBeLessThanOrEqual(column.x + column.width);

        // The offer is in that card, for someone new, and said once: no line
        // closes the rides with it.
        const offer = await box(how.getByRole("button", { name: texts.offer, exact: true }));
        expect(offer.x).toBeGreaterThanOrEqual(steps.x);
        expect(offer.x + offer.width).toBeLessThanOrEqual(steps.x + steps.width);
        expect(offer.y + offer.height).toBeLessThanOrEqual(steps.y + steps.height);
        await expect(main.getByRole("button", { name: texts.offer, exact: true })).toHaveCount(0);
        await expectNoSidewaysScroll(page);
      });
    }
  });
}

/**
 * Gives Find the rides leaving soonest with the first that goes elsewhere
 * than the first ride moved up beside it, from the 50 soonest.
 *
 * Which rides leave soonest changes with the hour and with what the other
 * journeys have posted. The cancelling journeys post Mjódd to N1 Selfoss for
 * tomorrow, an hour before now; from midnight UTC to the early morning those
 * trips come before every sample trip, and Find can list nothing else.
 */
async function anotherRouteSecond(page: Page) {
  await page.route(
    (url) => url.pathname === soonestTripsRoute.path,
    async (route) => {
      const url = new URL(route.request().url());
      const limit = Number(url.searchParams.get("limit"));
      url.searchParams.set("limit", String(soonestTripsMaxLimit));
      const response = await route.fetch({ url: url.toString() });
      const { results } = (await response.json()) as { results: TripSearchResult[] };
      const ends = (ride: TripSearchResult | undefined) =>
        `${ride?.board.meetingPoint.id ?? ""} ${ride?.alight.meetingPoint.id ?? ""}`;
      const other = results.findIndex((ride) => ends(ride) !== ends(results[0]));
      const order =
        other > 1
          ? [results[0], results[other], ...results.slice(1, other), ...results.slice(other + 1)]
          : results;
      await route.fulfill({ response, json: { results: order.slice(0, limit) } });
    },
  );
}

test.describe("Find's search row", () => {
  test.use({ viewport: laptop(1280), locale: "en-GB" });

  test("opens the calendar under the date, and gives focus back when it closes", async ({
    page,
  }) => {
    await page.goto("/");
    const row = page.getByTestId("search-row");
    const date = row.getByRole("button", { name: /^Date: / });
    await expect(date).toHaveAccessibleName("Date: Any day");
    await date.click();
    await expect(date).toHaveAttribute("aria-expanded", "true");
    // Any day is a choice like the days, and the one chosen so far.
    await expect(row.getByRole("radio", { name: "Any day" })).toBeChecked();
    const days = row.getByRole("radio", { disabled: false });
    await expect(days.first()).toBeVisible();
    // The calendar opens under the date, inside the card.
    const card = await box(row);
    const calendar = await box(days.last());
    expect(calendar.y).toBeGreaterThan((await box(date)).y);
    expect(calendar.x + calendar.width).toBeLessThanOrEqual(card.x + card.width);

    await page.keyboard.press("Escape");
    await expect(days).toHaveCount(0);
    await expect(date).toBeFocused();

    await page.keyboard.press("Enter");
    await days.last().click();
    await expect(days).toHaveCount(0);
    await expect(date).not.toHaveAccessibleName("Date: Any day");
    await expect(date).toBeFocused();
  });

  test("shows the rides leaving soon in two columns, and the one under the pointer on the map", async ({
    page,
  }) => {
    await anotherRouteSecond(page);
    await page.goto("/");
    const rides = page.getByTestId("columns-main").getByTestId("trip-result");
    await expect(rides.first()).toBeVisible();
    const first = await box(rides.nth(0));
    const second = await box(rides.nth(1));
    expect(second.y).toBeCloseTo(first.y, 0);
    expect(second.x).toBeGreaterThan(first.x + first.width);
    // The cards of a row are as tall as each other, whatever they hold.
    const cards = page.getByTestId("columns-main").getByTestId("card");
    const heights = await Promise.all(
      (await cards.all()).map(async (card) => (await box(card)).height),
    );
    expect(heights.length).toBeGreaterThanOrEqual(4);
    for (let left = 0; left + 1 < heights.length; left += 2) {
      expect(heights[left + 1]).toBeCloseTo(heights[left] ?? 0, 0);
    }
    // Which rides leave soon changes with the hour, and they may all be as
    // tall of themselves. So the first card is given more to hold here: the
    // one beside it grows with it.
    await cards
      .nth(0)
      .getByTestId("card-face")
      .evaluate((face) => {
        const more = document.createElement("div");
        more.style.height = "200px";
        face.append(more);
      });
    await expect
      .poll(async () => (await box(cards.nth(1))).height)
      .toBeGreaterThan((heights[1] ?? 0) + 100);
    expect((await box(cards.nth(1))).height).toBeCloseTo((await box(cards.nth(0))).height, 0);

    // The map beside them shows the first ride, and then the one the
    // pointer comes to, and keeps it once the pointer has left.
    const map = page.getByTestId("columns-side").getByTestId("iceland-map");
    expect((await box(map)).x).toBeGreaterThan(second.x + second.width);
    /** The ride of a card as the map names it, from the stops the card shows. */
    const onMap = async (place: number) => {
      const name = (await cards.nth(place).getAttribute("aria-label")) ?? "";
      const [, from, to] =
        /Leaves (.+) at \d\d:\d\d, arrives at (.+) at \d\d:\d\d,/.exec(name) ?? [];
      return `The ride on a map of Iceland: ${from ?? "?"} → ${to ?? "?"}.`;
    };
    await expect(map).toHaveAccessibleName(await onMap(0));
    // A ride that goes elsewhere than the first, so the map has to change.
    const names = await Promise.all((await cards.all()).map((_, place) => onMap(place)));
    const other = names.findIndex((name) => name !== names[0]);
    expect(other).toBeGreaterThan(0);
    const primary = "rgb(47, 107, 79)";
    await expect(cards.nth(0)).toHaveCSS("border-bottom-color", primary);
    await cards.nth(other).hover();
    await expect(map).toHaveAccessibleName(names[other] ?? "");
    await page.getByRole("heading", { name: "Leaving soon" }).hover();
    await expect(map).toHaveAccessibleName(names[other] ?? "");
    // Its card keeps the edge it had under the pointer, and the first lost it.
    await expect(cards.nth(other)).toHaveCSS("border-bottom-color", primary);
    await expect(cards.nth(0)).not.toHaveCSS("border-bottom-color", primary);
    // The keyboard does the same as the pointer.
    await cards.nth(0).focus();
    await expect(map).toHaveAccessibleName(names[0] ?? "");
    await expect(cards.nth(0)).toHaveCSS("border-bottom-color", primary);
    // "How it works" is whole in a window 720 high, the offer in it; the map
    // follows under it (spec 31, 3.16).
    await page.setViewportSize({ width: 1280, height: 720 });
    const how = await box(page.getByTestId("columns-side").getByTestId("how-it-works"));
    expect(how.y + how.height).toBeLessThanOrEqual(720);
  });

  test("keeps the map whole in a window 720 high for someone signed in with nothing coming up", async ({
    page,
  }) => {
    await signUp(page, english, "Dóra");
    await page.setViewportSize({ width: 1280, height: 720 });
    // Nothing needs her and she has no ride: the map leads the side column
    // and is whole in the window (spec 18, 3.5). The link under it starts in
    // the window and ends under its edge, since the scene is higher (spec
    // 31, 3.16).
    const side = page.getByTestId("columns-side").filter({ visible: true });
    await expect(side.getByTestId("how-it-works")).toHaveCount(0);
    const map = await box(side.getByTestId("iceland-map"));
    expect(map.y + map.height).toBeLessThanOrEqual(720);
    const points = await box(side.getByRole("link", { name: "See the meeting points" }));
    expect(points.y).toBeGreaterThan(map.y + map.height - 1);
    expect(points.y).toBeLessThan(720);
  });
});

const resultsTexts = {
  "en-GB": {
    ...findTexts["en-GB"],
    to: /^To: /,
    fromLabel: "From",
    toLabel: "To",
    borgarnes: /^N1 Borgarnes,/,
    blonduos: /^Olís Blönduós,/,
    map: "The ride on a map of Iceland: N1 Borgarnes → Olís Blönduós.",
  },
  "is-IS": {
    ...findTexts["is-IS"],
    to: /^Til: /,
    fromLabel: "Frá",
    toLabel: "Til",
    borgarnes: /^N1 Borgarnesi,/,
    blonduos: /^Olís Blönduósi,/,
    map: "Ferðin á korti af Íslandi: N1 Borgarnesi → Olís Blönduósi.",
  },
} as const;

/**
 * Searches from Borgarnes to Blönduós on Find, and gives the first trip
 * found: the sample trip from Reykjavík to Akureyri, which goes through both.
 *
 * The trip is looked for on the results page only. Find lists rides too,
 * as the same cards, and it is still on show for a moment after its button
 * is pressed: a click on one of its cards would wait for ever, as Find stays
 * in the page, hidden, under the results.
 */
async function searchNorth(page: Page, texts: (typeof resultsTexts)["en-GB" | "is-IS"]) {
  await page.goto("/");
  const row = page.getByTestId("search-row");
  await row.getByRole("button", { name: texts.from }).click();
  await row.getByLabel(texts.fromLabel, { exact: true }).fill("borg");
  await row.getByRole("button", { name: texts.borgarnes }).click();
  await row.getByRole("button", { name: texts.to }).click();
  await row.getByLabel(texts.toLabel, { exact: true }).fill("blön");
  await row.getByRole("button", { name: texts.blonduos }).click();
  await row.getByRole("button", { name: texts.find, exact: true }).click();
  const results = page
    .getByTestId("screen-scroll")
    .filter({ has: page.getByTestId("results-heading") });
  const trip = results.getByTestId("trip-result").first();
  await expect(trip).toBeVisible();
  return trip;
}

// Search results (spec 18, 3.6; spec 31, 3.6): the ride on our map beside
// the list, one row over the rides, and filters that wrap.
for (const locale of ["en-GB", "is-IS"] as const) {
  const texts = resultsTexts[locale];

  test.describe(`search results, ${locale}`, () => {
    test.use({ locale });

    for (const width of widths) {
      test(`shows the trip on the map beside the list, ${String(width)} wide`, async ({ page }) => {
        await page.setViewportSize(laptop(width));
        const trip = await searchNorth(page, texts);
        const map = page.getByTestId("aside").getByTestId("iceland-map");
        await expect(map).toHaveAccessibleName(texts.map);
        // The map stands beside the list, level with its top.
        const list = await box(trip);
        const drawn = await box(map);
        const back = await box(page.getByTestId("results-heading").filter({ visible: true }));
        expect(drawn.x).toBeGreaterThan(list.x + list.width);
        expect(drawn.y).toBeCloseTo(back.y, 0);
        expect(drawn.width).toBeGreaterThan(300);

        // The order, Filters and the count are one row in the list's column,
        // the count at its right. The filters open under it, each whole and
        // inside the column: none is reached by scrolling sideways.
        const results = page
          .getByTestId("screen-scroll")
          .filter({ has: page.getByTestId("results-heading") });
        const row = results.getByTestId("results-row");
        const within = await box(row);
        const count = await box(row.getByTestId("results-count"));
        expect(count.x + count.width).toBeCloseTo(within.x + within.width, 0);
        const sort = await box(row.getByRole("button").first());
        expect(count.y).toBeLessThan(sort.y + sort.height);
        await row.getByRole("button", { name: texts.filters, exact: true }).click();
        const all = await results.getByTestId("results-filters").getByRole("checkbox").all();
        expect(all).toHaveLength(4);
        for (const chip of all) {
          const one = await box(chip);
          expect(one.x).toBeGreaterThanOrEqual(within.x);
          expect(one.x + one.width).toBeLessThanOrEqual(within.x + within.width + 1);
        }
        expect(within.x + within.width).toBeLessThan(drawn.x);
        await expectNoSidewaysScroll(page);
      });
    }
  });
}

const tripTexts = {
  "en-GB": {
    ...resultsTexts["en-GB"],
    trip: "N1 Borgarnes to Olís Blönduós",
    request: "Send request",
    moreSeats: "One seat more",
  },
  "is-IS": {
    ...resultsTexts["is-IS"],
    trip: "N1 Borgarnesi → Olís Blönduósi",
    request: "Senda beiðni",
    moreSeats: "Einu sæti fleira",
  },
} as const;

/** Only what is on show: screens beneath the one open stay in the page. */
const shown = { visible: true } as const;

// Ride details (spec 18, 3.7; spec 31, 3.7): your part and who you ride with
// in the main column, with booking and the whole route beside them.
for (const locale of ["en-GB", "is-IS"] as const) {
  const texts = tripTexts[locale];

  test.describe(`ride details, ${locale}`, () => {
    test.use({ locale });

    for (const width of widths) {
      test(`has booking and the route beside your part, ${String(width)} wide`, async ({
        page,
      }) => {
        await page.setViewportSize(laptop(width));
        await (await searchNorth(page, texts)).click();
        // `exact`: the results' heading names the same two places.
        await expect(
          page.getByRole("heading", { name: texts.trip, exact: true }).filter(shown),
        ).toBeVisible();

        const main = page.getByTestId("columns-main").filter(shown);
        const side = page.getByTestId("columns-side").filter(shown);
        const mainBox = await box(main);
        const sideBox = await box(side);
        expect(sideBox.x).toBeGreaterThan(mainBox.x + mainBox.width);
        expect(sideBox.y).toBeCloseTo(mainBox.y, 0);

        // Booking is at the top of the side column: the seats and the
        // button, whole, with no bar at the bottom of the window.
        const request = await box(side.getByRole("button", { name: texts.request, exact: true }));
        const more = await box(side.getByRole("button", { name: texts.moreSeats }));
        for (const part of [request, more]) {
          expect(part.x).toBeGreaterThanOrEqual(sideBox.x);
          expect(part.x + part.width).toBeLessThanOrEqual(sideBox.x + sideBox.width + 1);
        }
        expect(more.y).toBeLessThan(request.y);
        await expect(page.getByTestId("bottom-bar").filter(shown)).toHaveCount(0);
        // The route's map is in the side column too, under booking.
        const map = await box(side.getByTestId("iceland-map"));
        expect(map.y).toBeGreaterThan(request.y + request.height);

        // Your part is one ticket across the main column, with the driver's
        // card and the seats under it (spec 31, 3.7).
        const ticket = await box(main.getByTestId("part-ticket"));
        const driver = await box(main.getByTestId("driver-card"));
        const seats = await box(main.getByTestId("where-you-sit"));
        expect(ticket.x).toBeGreaterThanOrEqual(mainBox.x);
        expect(ticket.x + ticket.width).toBeLessThanOrEqual(mainBox.x + mainBox.width + 1);
        expect(driver.y).toBeGreaterThan(ticket.y + ticket.height - 1);
        expect(seats.y).toBeGreaterThan(driver.y + driver.height - 1);
        // The whole route is beside them, under the map.
        const route = await box(side.getByTestId("route-stop").first());
        expect(route.y).toBeGreaterThan(map.y + map.height - 1);
        await expectNoSidewaysScroll(page);
      });
    }
  });
}

test.describe("ride details and a request", () => {
  test.use({ viewport: laptop(1280), locale: "en-GB" });

  test("prices the seats chosen beside the price, and asks for them in two columns", async ({
    page,
  }) => {
    await signUp(page, english, "Dóra");
    await (await searchNorth(page, tripTexts["en-GB"])).click();
    const side = page.getByTestId("columns-side").filter(shown);
    const price = side.getByText(/^[\d,]+ ISK$/);
    const one = await price.textContent();
    await side.getByRole("button", { name: "One seat more" }).click();
    await expect(page).toHaveURL(/seats=2$/);
    await expect(price).not.toHaveText(one ?? "");
    await side.getByRole("button", { name: "Send request", exact: true }).click();

    // A request: the message in the main column, the ride, the total and
    // the button beside it.
    await expect(page.getByRole("heading", { name: "Request this ride" })).toBeVisible();
    const message = page
      .getByTestId("columns-main")
      .filter(shown)
      .getByLabel("Message to the driver (optional)");
    await message.fill("One small bag.");
    const ride = page.getByTestId("columns-side").filter(shown);
    await expect(ride.getByText(/^2 seats × [\d,]+ ISK$/)).toBeVisible();
    for (const width of widths) {
      await page.setViewportSize(laptop(width));
      const field = await box(message);
      const send = await box(ride.getByRole("button", { name: "Send request", exact: true }));
      expect(send.x).toBeGreaterThan(field.x + field.width);
      await expect(page.getByTestId("bottom-bar").filter(shown)).toHaveCount(0);
      await expectNoSidewaysScroll(page);
    }
    // What was typed stays as the window changes.
    await expect(message).toHaveValue("One small bag.");
  });
});

/**
 * A passenger in a browser of their own signs up and asks for a seat on the
 * driver's trip, from its first stop to its second, or to the stop numbered
 * `to`. They are left on the page that says the request was sent.
 */
async function askForSeat(
  browser: Browser,
  baseURL: string | undefined,
  tripId: string,
  name: string,
  to = 1,
) {
  const context = await browser.newContext({ viewport: laptop(1280), baseURL, locale: "en-GB" });
  const passenger = await context.newPage();
  await signUp(passenger, english, name);
  await passenger.goto(`/trips/${tripId}?from=0&to=${String(to)}`);
  await passenger.getByRole("button", { name: "Send request", exact: true }).click();
  await expect(passenger.getByRole("heading", { name: "Request this ride" })).toBeVisible();
  await passenger
    .getByTestId("columns-side")
    .filter(shown)
    .getByRole("button", { name: "Send request", exact: true })
    .click();
  await expect(passenger).toHaveURL(/\/bookings\/[0-9a-f-]+\/booked$/);
  return passenger;
}

/** The driver accepts the request of the passenger named, on their trip's page. */
async function accept(driver: Page, tripId: string, name: string) {
  await driver.goto(`/drive/trips/${tripId}`);
  await driver.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(passengerRow(driver, name, "Waiting for payment")).toBeVisible();
}

/**
 * Pays for the accepted booking on show in the test sheet, where no money
 * moves. The sheet opens in the button's place and its button has the same
 * name, so the second press waits for the sheet.
 */
async function payInSheet(passenger: Page) {
  const pay = passenger.getByRole("button", { name: /^Pay [\d,]+ ISK$/ });
  await pay.click();
  await expect(
    passenger.getByRole("heading", { name: "Test payment: no money moves" }),
  ).toBeVisible();
  await pay.click();
  await expect(
    passenger.getByText("Your seat is confirmed", { exact: true }).filter(shown),
  ).toBeVisible();
}

/**
 * A passenger in a browser of their own signs up, asks for a seat on the
 * driver's trip and pays once the driver has accepted, then writes to the
 * driver from the booking.
 */
async function bookAndWrite(
  browser: Browser,
  baseURL: string | undefined,
  driver: Page,
  tripId: string,
  name: string,
  text: string,
) {
  const passenger = await askForSeat(browser, baseURL, tripId, name);
  await accept(driver, tripId, name);
  await passenger.reload();
  await payInSheet(passenger);
  await passenger.getByRole("link", { name: "Message Bára" }).click();
  const open = passenger.getByTestId("panes-open");
  await open.getByLabel("Write a message").fill(text);
  await open.getByRole("button", { name: "Send", exact: true }).click();
  await expect(open.getByLabel(/^You, \d\d:\d\d: /)).toBeVisible();
  return passenger;
}

// Messages (spec 18, 3.11): my conversations and the open one in two panes
// of one card, which is as tall as the window allows.
test.describe("Messages", () => {
  test.use({ viewport: laptop(1280), locale: "en-GB" });

  test("has my conversations beside the open one, and changes it in place", async ({
    page: driver,
    browser,
  }, testInfo) => {
    // Three people sign up, two of them book and pay.
    test.setTimeout(120_000);
    const { baseURL } = testInfo.project.use;
    await signUp(driver, english, "Bára");
    const tripId = await postTripToSelfoss(driver, "18:15");
    const dora = await bookAndWrite(
      browser,
      baseURL,
      driver,
      tripId,
      "Dóra",
      "Where shall I wait?",
    );

    // A chat opened from a booking has the two panes too, with its row the
    // current one, and the list shows what was just sent.
    const hers = dora.getByTestId("panes-list");
    await expect(
      dora.getByTestId("panes-open").getByRole("heading", { name: "Bára" }),
    ).toBeVisible();
    await expect(hers.getByRole("button", { name: /^Bára, / })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(hers.getByText("You: Where shall I wait?")).toBeVisible();
    const einar = await bookAndWrite(browser, baseURL, driver, tripId, "Einar", "Room for skis?");

    // Messages in the menu: the list, and nothing opened by itself.
    await driver.goto("/messages");
    // The one on show: Messages in the menu stays under a conversation.
    const list = driver.getByTestId("panes-list").filter(shown);
    const open = driver.getByTestId("panes-open").filter(shown);
    await expect(open.getByText("Choose a conversation")).toBeVisible();
    await expect(list.getByRole("button", { name: /^Einar, .*, 1 unread$/ })).toBeVisible();
    await list.getByRole("button", { name: /^Dóra, .*, 1 unread$/ }).click();
    await expect(driver).toHaveURL(/\/messages\/[0-9a-f-]+$/);
    const doras = driver.url();
    await expect(open.getByRole("heading", { name: "Dóra" })).toBeVisible();
    await expect(open.getByLabel(/^Dóra, \d\d:\d\d: Where shall I wait\?$/)).toBeVisible();
    await expect(list.getByRole("button", { name: /^Dóra, / })).toHaveAttribute(
      "aria-current",
      "true",
    );
    // Read, so no longer counted; Einar's still is.
    await expect(list.getByText("1 unread")).toHaveCount(1);

    for (const width of widths) {
      await driver.setViewportSize(laptop(width));
      const card = await box(driver.getByTestId("panes").filter(shown));
      const listBox = await box(list);
      const openBox = await box(open);
      expect(listBox.width).toBeCloseTo(360, 0);
      expect(openBox.x).toBeGreaterThanOrEqual(listBox.x + listBox.width - 1);
      expect(openBox.y).toBeCloseTo(listBox.y, 0);
      // The card ends inside the window: the panes scroll, not the page.
      expect(card.y + card.height).toBeLessThanOrEqual(laptop(width).height);
      // Everything to press or write in is whole inside the open pane's
      // width, and the field and Send are at its bottom, inside the card.
      const parts = await open.locator('[role="button"], textarea').all();
      expect(parts.length).toBeGreaterThan(8);
      for (const part of parts) {
        const one = await box(part);
        expect(one.x).toBeGreaterThanOrEqual(openBox.x);
        expect(one.x + one.width).toBeLessThanOrEqual(openBox.x + openBox.width + 1);
      }
      for (const part of [
        open.getByLabel("Write a message"),
        open.getByRole("button", { name: "Send", exact: true }),
      ]) {
        const one = await box(part);
        expect(one.y).toBeGreaterThan(card.y + card.height / 2);
        expect(one.y + one.height).toBeLessThanOrEqual(card.y + card.height);
      }
      await expectNoSidewaysScroll(driver);
    }

    // Another row shows its conversation in the same place, at its own
    // address; the browser's Back then leaves the conversations.
    await list.getByRole("button", { name: /^Einar, / }).click();
    await expect(open.getByRole("heading", { name: "Einar" })).toBeVisible();
    await expect(open.getByLabel(/^Einar, \d\d:\d\d: Room for skis\?$/)).toBeVisible();
    await expect(driver).toHaveURL(/\/messages\/[0-9a-f-]+$/);
    expect(driver.url()).not.toBe(doras);
    await expect(list.getByRole("button", { name: /^Einar, / })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await driver.goBack();
    await expect(driver).toHaveURL(/\/messages$/);
    await expect(driver.getByText("Choose a conversation").filter(shown)).toBeVisible();

    // In Icelandic, with its longer words, at the narrowest wide window.
    await driver.setViewportSize(laptop(widths[0]));
    await driver.getByRole("button", { name: "Change the language to Icelandic" }).click();
    await list.getByRole("button", { name: /^Dóra, / }).click();
    await expect(open.getByRole("heading", { name: "Dóra" })).toBeVisible();
    const paneBox = await box(open);
    for (const part of await open.locator('[role="button"], textarea').all()) {
      const one = await box(part);
      expect(one.x).toBeGreaterThanOrEqual(paneBox.x);
      expect(one.x + one.width).toBeLessThanOrEqual(paneBox.x + paneBox.width + 1);
    }
    await expectNoSidewaysScroll(driver);
    await dora.context().close();
    await einar.context().close();
  });
});

/** Whether the second stands beside the first, in the same row, as tall as it is. */
async function expectSideBySide(first: Locator, second: Locator) {
  // The grid counts its columns again after the window changes.
  await expect(async () => {
    const one = await box(first);
    const other = await box(second);
    expect(other.y).toBeCloseTo(one.y, 0);
    expect(other.x).toBeGreaterThan(one.x + one.width);
    expect(other.width).toBeCloseTo(one.width, 0);
    expect(other.height).toBeCloseTo(one.height, 0);
  }).toPass({ timeout: 5_000 });
}

/** Everything to press in the part is whole inside its width. */
async function expectButtonsInside(
  part: Locator,
  atLeast: number,
  toPress = '[role="button"], [role="link"]',
) {
  const partBox = await box(part);
  const buttons = await part.locator(toPress).all();
  expect(buttons.length).toBeGreaterThanOrEqual(atLeast);
  for (const button of buttons) {
    const one = await box(button);
    expect(one.x).toBeGreaterThanOrEqual(partBox.x);
    expect(one.x + one.width).toBeLessThanOrEqual(partBox.x + partBox.width + 1);
  }
}

// My rides, a booking and Profile (spec 18, 3.10 and 3.9; spec 31, 3.16
// item 5): the rides in a grid, a booking's ride beside where it stands,
// and who I am beside my profile's groups of rows.
test.describe("My rides, a booking and Profile", () => {
  test.use({ viewport: laptop(1280), locale: "en-GB" });

  test("show my rides in a grid, a booking in two columns and who I am beside the rows", async ({
    page: driver,
    browser,
  }, testInfo) => {
    // Two people sign up, one posts two trips, the other books and pays.
    test.setTimeout(150_000);
    const { baseURL } = testInfo.project.use;
    await signUp(driver, english, "Bára");
    const tripId = await postTripToSelfoss(driver, "17:45");
    // Later than the first one ends: a driver has one trip at a time.
    await postTripToSelfoss(driver, "20:15", [], true);

    // My rides: the two trips she drives stand side by side, as tall as
    // each other, under a title that starts where they do.
    await driver.goto("/my-rides");
    const rides = driver.getByTestId("grid").filter(shown).getByTestId("grid-cell");
    await expect(rides).toHaveCount(2);
    for (const width of widths) {
      await driver.setViewportSize(laptop(width));
      await expectSideBySide(rides.nth(0), rides.nth(1));
      const title = await box(driver.getByRole("heading", { name: "My rides" }).filter(shown));
      expect(title.x).toBeCloseTo((await box(rides.nth(0))).x, 0);
      // A card fills its cell.
      const cell = await box(rides.nth(0));
      const card = await box(rides.nth(0).getByRole("button"));
      expect(card.height).toBeCloseTo(cell.height, 0);
      // "Offer a ride" stands on the title's line, at the right edge of the
      // page, where the rides' grid ends (spec 31, 3.10, item 1).
      const offer = await box(
        driver
          .getByTestId("screen-head-action")
          .filter(shown)
          .getByRole("button", { name: "Offer a ride" }),
      );
      expect(offer.x).toBeGreaterThan(title.x + title.width);
      expect(offer.y + offer.height / 2).toBeGreaterThan(title.y);
      expect(offer.y + offer.height / 2).toBeLessThan(title.y + title.height);
      const grid = await box(driver.getByTestId("grid").filter(shown));
      expect(offer.x + offer.width).toBeCloseTo(grid.x + grid.width, 0);
      await expectNoSidewaysScroll(driver);
    }
    await driver.setViewportSize(laptop(1280));

    // A request for the whole trip, out of the capital area, so the rows
    // have all they can have (spec 31, 3.16, item 2): the ride as a ticket
    // beside the road and the driver, and "Withdraw request" the last row
    // under it.
    const dora = await askForSeat(browser, baseURL, tripId, "Dóra", 3);
    const booking = dora.url().replace(/\/booked$/, "");
    await dora.goto(booking);
    const main = dora.getByTestId("columns-main").filter(shown);
    const side = dora.getByTestId("columns-side").filter(shown);
    const ticket = side.getByTestId("booking-ticket");
    const withdraw = side.getByRole("button", { name: "Withdraw request" });
    await expect(withdraw).toBeVisible();
    await expect(ticket).toBeVisible();
    await expect(main.getByLabel("Step 1 of 4: Asked")).toBeVisible();
    // The driver's card has a cell of its own while there is no place to
    // stand at yet.
    await expect(main.getByTestId("grid-cell")).toHaveCount(1);

    // Accepted: Pay is at the top of the side column at every width, over
    // the ride, with "Cancel booking" the last row and no bar at the
    // window's bottom.
    await accept(driver, tripId, "Dóra");
    await dora.reload();
    const pay = side.getByRole("button", { name: /^Pay [\d,]+ ISK$/ });
    await expect(pay).toBeVisible();
    await expect(
      dora.getByRole("heading", { name: "Bára said yes: pay to keep your seat" }),
    ).toBeVisible();
    for (const width of widths) {
      await dora.setViewportSize(laptop(width));
      const mainBox = await box(main);
      const sideBox = await box(side);
      expect(sideBox.x).toBeGreaterThan(mainBox.x + mainBox.width);
      expect(sideBox.y).toBeCloseTo(mainBox.y, 0);
      const payBox = await box(pay);
      const ticketBox = await box(ticket);
      expect(payBox.x).toBeGreaterThanOrEqual(sideBox.x);
      expect(payBox.x + payBox.width).toBeLessThanOrEqual(sideBox.x + sideBox.width + 1);
      expect(payBox.y + payBox.height).toBeLessThanOrEqual(ticketBox.y);
      const cancel = await box(side.getByRole("button", { name: "Cancel booking" }));
      expect(cancel.y).toBeGreaterThan(ticketBox.y + ticketBox.height - 1);
      await expect(dora.getByTestId("bottom-bar").filter(shown)).toHaveCount(0);
      await expectNoSidewaysScroll(dora);
    }

    // Paid: the driver, with Message, and where to stand share a row where
    // the main column has room for both; sharing, the weather, reporting
    // and cancelling are rows beside them, under the ride.
    await dora.setViewportSize(laptop(1280));
    await payInSheet(dora);
    const cells = main.getByTestId("grid-cell");
    await expect(cells).toHaveCount(2);
    await expect(cells.nth(0).getByText("Bára", { exact: true })).toBeVisible();
    await expect(cells.nth(0).getByRole("link", { name: "Message Bára" })).toBeVisible();
    await expect(cells.nth(1).getByRole("heading", { name: "Where to stand" })).toBeVisible();
    for (const width of widths) {
      await dora.setViewportSize(laptop(width));
      if (width >= 1280) {
        await expectSideBySide(cells.nth(0), cells.nth(1));
      } else {
        await expect(async () => {
          const driverBox = await box(cells.nth(0));
          const standBox = await box(cells.nth(1));
          expect(standBox.x).toBeCloseTo(driverBox.x, 0);
          expect(standBox.y).toBeGreaterThan(driverBox.y + driverBox.height - 1);
        }).toPass({ timeout: 5_000 });
      }
      // The rows in their order, what cannot be undone last (R31.3).
      let above = await box(ticket);
      for (const name of [
        "Share the ride's details",
        "Weather and roads",
        "Report a problem with this ride",
        "Cancel booking",
      ]) {
        const row = await box(
          side
            .getByRole("button", { name, exact: true })
            .or(side.getByRole("link", { name, exact: true })),
        );
        expect(row.y).toBeGreaterThan(above.y + above.height - 1);
        above = row;
      }
      await expectButtonsInside(side, 4);
      // Message, the driver's profile and "Open in maps".
      await expectButtonsInside(main, 3);
      await expectNoSidewaysScroll(dora);
    }

    // In a small laptop's window the side column is whole: nothing in it
    // is reached only by scrolling the column itself.
    await dora.setViewportSize({ width: 1280, height: 720 });
    await expect(async () => {
      expect(await side.evaluate((part) => part.scrollHeight - part.clientHeight)).toBe(0);
    }).toPass({ timeout: 5_000 });
    const sideBox = await box(side);
    const last = await box(side.getByRole("button", { name: "Cancel booking" }));
    expect(last.y + last.height).toBeLessThanOrEqual(sideBox.y + sideBox.height);
    expect(sideBox.y + sideBox.height).toBeLessThanOrEqual(720);

    // Her own rides: one card in a cell of the grid, not across the page.
    await dora.setViewportSize(laptop(1280));
    await dora.goto("/my-rides");
    const hers = dora.getByTestId("grid").filter(shown).getByTestId("grid-cell");
    await expect(hers).toHaveCount(1);
    await expect(hers.getByRole("button", { name: /^Passenger, / })).toBeVisible();
    expect((await box(hers)).width).toBeLessThan(480);

    // Profile (spec 31, 3.16 item 5): who I am in a card at the left, the
    // groups of rows beside it.
    await dora.goto("/profile");
    await expect(dora.getByRole("heading", { name: "My profile" }).filter(shown)).toBeVisible();
    const who = dora.getByTestId("columns-side").filter(shown);
    const rows = dora.getByTestId("columns-main").filter(shown);
    await expect(who.getByTestId("person-card")).toBeVisible();
    await expect(who.getByRole("button", { name: "Edit profile" })).toBeVisible();
    await expect(rows.getByRole("heading", { name: "Safety and privacy" })).toBeVisible();
    await expect(rows.getByRole("link", { name: "Language, English" })).toBeVisible();
    await expect(rows.getByTestId("action-rows")).toHaveCount(5);
    // The card comes before the rows for the keyboard and a reader too,
    // as it stands at their left (spec 31, 3.20).
    expect(
      await who.evaluate((card) => {
        const rowsOf = card.parentElement?.querySelector('[data-testid="columns-main"]');
        if (rowsOf === null || rowsOf === undefined) return "no rows";
        const after = card.compareDocumentPosition(rowsOf) & Node.DOCUMENT_POSITION_FOLLOWING;
        return after !== 0 ? "card first" : "rows first";
      }),
    ).toBe("card first");
    // No Settings any more, and the shake switch is for the phone apps.
    await expect(dora.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await expect(dora.getByRole("switch")).toHaveCount(0);
    for (const width of widths) {
      await dora.setViewportSize(laptop(width));
      const whoBox = await box(who);
      const rowsBox = await box(rows);
      expect(rowsBox.x).toBeGreaterThan(whoBox.x + whoBox.width);
      expect(rowsBox.y).toBeCloseTo(whoBox.y, 0);
      await expectButtonsInside(who, 3);
      await expectButtonsInside(rows, 16);
      await expectNoSidewaysScroll(dora);
    }

    // In Icelandic, with its longer words, at the narrowest wide window:
    // the profile, the booking and my rides.
    await dora.setViewportSize(laptop(widths[0]));
    await dora.getByRole("button", { name: "Change the language to Icelandic" }).click();
    await expect(
      dora.getByRole("heading", { name: "Prófíllinn minn" }).filter(shown),
    ).toBeVisible();
    await expectButtonsInside(who, 3);
    await expectButtonsInside(rows, 16);
    await expectNoSidewaysScroll(dora);
    await dora.goto(booking);
    await expect(dora.getByRole("heading", { name: "Sætið þitt er staðfest" })).toBeVisible();
    await expect(side.getByTestId("booking-ticket")).toBeVisible();
    await expect(side.getByRole("button", { name: "Afbóka", exact: true })).toBeVisible();
    await expectButtonsInside(side, 4);
    await expectButtonsInside(main, 3);
    await expectNoSidewaysScroll(dora);
    await dora.goto("/my-rides");
    await expect(hers).toHaveCount(1);
    await expectNoSidewaysScroll(dora);
    await dora.context().close();
  });
});

// Offer a ride and the driver's trip (spec 18, 3.13 and 3.14): each step in
// a column with "Your trip so far" and its button beside it, and the
// driver's trip with the seats on each stretch beside its lists.
test.describe("Offer a ride and the driver's ride", () => {
  test.use({ viewport: laptop(1280), locale: "en-GB" });

  test("post a trip step by step in two columns, then answer a request beside the ride, its seats and its rows", async ({
    page: driver,
    browser,
  }, testInfo) => {
    // A driver posts a trip with a car and a licence added on the way, and
    // a passenger asks for a seat.
    test.setTimeout(150_000);
    const { baseURL } = testInfo.project.use;
    await signUp(driver, english, "Bára");
    const main = driver.getByTestId("columns-main").filter(shown);
    const side = driver.getByTestId("columns-side").filter(shown);
    const soFar = side.getByTestId("trip-so-far");
    /** The step's two columns stand side by side, the step no wider than a phone's column. */
    const expectTwoColumns = async () => {
      // At the top of the step: once it is scrolled, the side column stays
      // in view while the main one moves, and choosing a time scrolls it.
      await driver
        .getByTestId("screen-scroll")
        .filter(shown)
        .evaluate((scroll) => {
          scroll.scrollTop = 0;
        });
      const mainBox = await box(main);
      const sideBox = await box(side);
      expect(sideBox.x).toBeGreaterThan(mainBox.x + mainBox.width);
      expect(sideBox.y).toBeCloseTo(mainBox.y, 0);
      expect(mainBox.width).toBeLessThanOrEqual(480);
      await expect(driver.getByTestId("bottom-bar").filter(shown)).toHaveCount(0);
      await expectNoSidewaysScroll(driver);
    };
    /** The button is whole in the window, wherever the step is scrolled to. */
    const expectInWindow = async (button: Locator) => {
      const { height } = driver.viewportSize() ?? { height: 0 };
      const one = await box(button);
      expect(one.y).toBeGreaterThanOrEqual(0);
      expect(one.y + one.height).toBeLessThanOrEqual(height);
    };

    // Step 1 on Offer: every row of the trip so far names its step.
    await driver.goto("/offer");
    await expect(main.getByRole("heading", { name: "Where are you driving?" })).toBeVisible();
    await expect(soFar.getByLabel("Route: Step 1")).toBeVisible();
    await expect(soFar.getByLabel("Price: Step 4")).toBeVisible();
    const toTimes = side.getByRole("button", { name: "Choose date and time" });
    const before = await box(toTimes);
    await expectTwoColumns();

    // The route as it is chosen, in two lines however many stops it has,
    // and its map under the button, which stays where it was.
    for (const [end, typed, card] of [
      ["From", "mjódd", /^Mjódd bus terminal,/],
      ["To", "selfo", /^N1 Selfoss,/],
    ] as const) {
      await main.getByRole("button", { name: new RegExp(`^${end}: `) }).click();
      await main.getByLabel(end, { exact: true }).fill(typed);
      await main.getByRole("button", { name: card }).click();
    }
    await expect(
      soFar.getByLabel("Route: Mjódd bus terminal to N1 Selfoss, 2 stops on the way"),
    ).toBeVisible();
    const map = side.getByTestId("iceland-map");
    await expect(map).toBeVisible();
    await expect(driver.getByTestId("iceland-map").filter(shown)).toHaveCount(1);
    for (const width of widths) {
      await driver.setViewportSize(laptop(width));
      await expectTwoColumns();
      const button = await box(toTimes);
      expect((await box(soFar)).y).toBeLessThan(button.y);
      expect((await box(map)).y).toBeGreaterThan(button.y + button.height);
      await expectButtonsInside(main, 4);
      await expectButtonsInside(side, 1);
    }
    // One line more in the trip so far, and no more, moved the button.
    await driver.setViewportSize(laptop(1280));
    expect((await box(toTimes)).y - before.y).toBeLessThan(40);
    await main.getByRole("switch", { name: "Olís Norðlingaholt" }).click();
    await expect(
      soFar.getByLabel("Route: Mjódd bus terminal to N1 Selfoss, 1 stop on the way"),
    ).toBeVisible();
    // In a small laptop's window the button is whole, above the map.
    await driver.setViewportSize({ width: 1280, height: 720 });
    await expectInWindow(toTimes);
    await driver.setViewportSize(laptop(1280));
    await toTimes.click();

    // Step 2: the day and the times as they are chosen.
    await expect(main.getByRole("heading", { name: "When are you leaving?" })).toBeVisible();
    await expect(soFar.getByLabel("Time: Step 2")).toBeVisible();
    const day = tomorrow("en");
    if (day.nextMonth) await main.getByRole("button", { name: "Next month" }).click();
    await main.getByRole("radio", { name: day.name }).click();
    await chooseTime(driver, "Leaving Mjódd bus terminal at", "17:45");
    await expect(soFar.getByLabel(/^Time: .+, 17:45 to \d\d:\d\d$/)).toBeVisible();
    await expect(soFar.getByLabel("Seats and booking: Step 3")).toBeVisible();
    await expect(soFar.getByLabel("Price: Step 4")).toBeVisible();
    await expectTwoColumns();
    await side.getByRole("button", { name: "Choose seats" }).click();

    // Step 3, the longest: its button stays in the window while the step
    // scrolls, also in a small laptop's window and in Icelandic.
    await expect(main.getByRole("heading", { name: "Seats and preferences" })).toBeVisible();
    await expect(
      soFar.getByLabel("Seats and booking: 3 seats, I approve each passenger"),
    ).toBeVisible();
    const toPrice = side.getByRole("button", { name: "Set your price" });
    const choices = '[role="button"], [role="radio"], [role="checkbox"], [role="switch"]';
    for (const width of widths) {
      await driver.setViewportSize(laptop(width));
      await expectTwoColumns();
      await expectButtonsInside(main, 10, choices);
    }
    await driver.setViewportSize(laptop(widths[0]));
    await driver.getByRole("button", { name: "Change the language to Icelandic" }).click();
    await expect(soFar.getByLabel(/^Sæti og bókun: 3 sæti, /)).toBeVisible();
    await expectTwoColumns();
    await expectButtonsInside(main, 10, choices);
    await driver.getByRole("button", { name: "Skipta yfir í ensku" }).click();
    await driver.setViewportSize({ width: 1280, height: 720 });
    await driver
      .getByTestId("screen-scroll")
      .filter(shown)
      .evaluate((scroll) => {
        // Not scrollTo: on the web a ScrollView's node carries React Native's own.
        scroll.scrollTop = scroll.scrollHeight;
      });
    await expect(main.getByLabel("Note to passengers (optional)")).toBeInViewport();
    await expectInWindow(toPrice);
    await toPrice.click();

    // Step 4: the price as it is chosen, for the seats just chosen.
    await expect(main.getByRole("heading", { name: "Set your price" })).toBeVisible();
    await expect(
      soFar.getByLabel("Seats and booking: 3 seats, I approve each passenger"),
    ).toBeVisible();
    await expect(soFar.getByLabel(/^Price: [\d,]+ ISK the whole way · 100%$/)).toBeVisible();
    await main.getByRole("button", { name: "Raise the price" }).click();
    await expect(soFar.getByLabel(/^Price: [\d,]+ ISK the whole way · 110%$/)).toBeVisible();
    await expectTwoColumns();
    await side.getByRole("button", { name: "Check your ride" }).click();

    // Step 5: Publish and what it waits for beside the ride as others will
    // see it, its rows and what is still missing (spec 31, 3.11).
    await expect(main.getByRole("heading", { name: "Check and publish" })).toBeVisible();
    await expect(main.getByRole("img", { name: "Step 5 of 5: Check" })).toBeVisible();
    await expect(main.getByTestId("preview-ticket")).toBeVisible();
    await expect(main.getByRole("link", { name: /^Route, .+, Change$/ })).toBeVisible();
    await expect(main.getByText("Three things before you publish", { exact: true })).toBeVisible();
    const publish = side.getByRole("button", { name: "Publish ride" });
    await expect(publish).toBeDisabled();
    await expect(
      side.getByText(/^Add a profile photo and your car, and confirm your licence to publish\./),
    ).toBeVisible();
    await expect(side.getByTestId("trip-so-far")).toHaveCount(0);
    await expectTwoColumns();
    await addPhotoBeforePublishing(driver);
    await main.getByRole("button", { name: "Add a car" }).click();
    await driver.getByLabel("Make").fill("Toyota");
    await driver.getByLabel("Model").fill("Yaris");
    await driver.getByRole("radio", { name: "White" }).click();
    await driver.getByRole("button", { name: "Save car" }).click();
    await main.getByRole("button", { name: "Confirm your licence" }).click();
    await driver
      .getByRole("checkbox", {
        name: "I declare that I hold a valid driving licence for the cars I drive on PuffinRide",
      })
      .click();
    await driver.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(driver.getByRole("heading", { name: "Your ride is published" })).toBeVisible();
    const [, tripId = ""] = /\/drive\/trips\/([0-9a-f-]+)\/published/.exec(driver.url()) ?? [];

    // The driver's ride (spec 31, 3.16, item 3): what needs me and the
    // passengers in the main column; beside them the ride as its ticket,
    // its seats and its rows, with cancelling last.
    const dora = await askForSeat(browser, baseURL, tripId, "Dóra");
    await driver.goto(`/drive/trips/${tripId}`);
    const head = driver.getByTestId("screen-head").filter(shown);
    await expect(head.getByRole("heading", { name: "Your ride to N1 Selfoss" })).toBeVisible();
    await expect(head.getByText("1 request needs your answer.", { exact: true })).toBeVisible();
    await expect(main.getByRole("heading", { name: "Needs you" })).toBeVisible();
    const ticket = side.getByTestId("driver-ride-ticket");
    await expect(ticket).toBeVisible();
    const seats = side.getByTestId("seats-card");
    // A request holds its seat until it is answered.
    await expect(seats.getByText("1 of 3 taken", { exact: true })).toBeVisible();
    await expect(
      seats.getByText("at the busiest, Mjódd bus terminal to N1 Hveragerði", { exact: true }),
    ).toBeVisible();
    const rows = side.getByTestId("ride-rows");
    const row = (name: string) =>
      rows
        .getByRole("button", { name, exact: true })
        .or(rows.getByRole("link", { name, exact: true }));
    for (const width of widths) {
      await driver.setViewportSize(laptop(width));
      const mainBox = await box(main);
      const sideBox = await box(side);
      expect(sideBox.x).toBeGreaterThan(mainBox.x + mainBox.width);
      expect(sideBox.y).toBeCloseTo(mainBox.y, 0);
      // The ticket, the seats and the rows in their order, what cannot be
      // undone last (R31.3).
      let above = await box(ticket);
      for (const part of [
        seats,
        row("Edit the ride"),
        row("Share the ride's details"),
        row("Weather and roads"),
        row("Cancel the ride"),
      ]) {
        const partBox = await box(part);
        expect(partBox.y).toBeGreaterThan(above.y + above.height - 1);
        above = partBox;
      }
      // Sharing in the ticket's corner, "Each stretch" and the four rows.
      await expectButtonsInside(side, 6);
      // The person asking, Decline, Accept, reporting them, and posting it again.
      await expectButtonsInside(main, 6);
      await expect(driver.getByTestId("bottom-bar").filter(shown)).toHaveCount(0);
      await expectNoSidewaysScroll(driver);
    }

    // In a small laptop's window the side column is whole: nothing in it
    // is reached only by scrolling the column itself. Sharing the ride is
    // the button in the ticket's corner there, with no row of its own.
    await expect(rows.getByRole("link", { name: "Share this ride" })).toHaveCount(0);
    await driver.setViewportSize({ width: 1280, height: 720 });
    await expect(async () => {
      expect(await side.evaluate((part) => part.scrollHeight - part.clientHeight)).toBe(0);
    }).toPass({ timeout: 5_000 });
    const whole = await box(side);
    const last = await box(row("Cancel the ride"));
    expect(last.y + last.height).toBeLessThanOrEqual(whole.y + whole.height);
    await driver.setViewportSize(laptop(1280));

    // Each stretch unfolds under the seats, where it stands.
    await seats.getByRole("button", { name: "Each stretch" }).click();
    await expect(
      seats.getByLabel("Mjódd bus terminal to N1 Hveragerði, 1 of 3 seats taken"),
    ).toBeVisible();

    // Share this ride (spec 28, 3.1 and 3.2), from the ticket's corner: the
    // trip and the panel in the screen's column, the post's text in it.
    await side.getByRole("button", { name: "Share this ride" }).click();
    await expect(driver.getByRole("heading", { name: "Share this ride" })).toBeVisible();
    const post = driver
      .getByText(/^Offering a ride: Mjódd bus terminal → N1 Selfoss\n/u)
      .filter(shown);
    await expect(post).toBeVisible();
    await expect(driver.getByRole("button", { name: "Share on Facebook" })).toBeVisible();
    expect((await box(post)).width).toBeLessThanOrEqual(maxContentWidth);
    await expectNoSidewaysScroll(driver);
    await driver.goBack();
    await expect(row("Edit the ride")).toBeVisible();

    await main.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(passengerRow(main, "Dóra", "Waiting for payment")).toBeVisible();
    await expect(seats.getByText("1 of 3 taken", { exact: true })).toBeVisible();

    // In Icelandic at the narrowest wide window.
    await driver.setViewportSize(laptop(widths[0]));
    await driver.getByRole("button", { name: "Change the language to Icelandic" }).click();
    await expect(rows.getByRole("link", { name: "Breyta ferð" })).toBeVisible();
    await expectButtonsInside(side, 6);
    // Dóra's row, and posting it again and the way back.
    await expectButtonsInside(main, 3);
    await expectNoSidewaysScroll(driver);

    // The trip day (spec 31, 3.9, item 4, and 3.16, item 3): Dóra pays, and
    // the ride leaves in 20 minutes. "I'm here" leads the side column, the
    // screen's main button, over the ticket, the seats and the rows.
    await dora.reload();
    await payInSheet(dora);
    const moved = await driver.request.post(`${apiUrl}/e2e/trips/${tripId}/move`, {
      data: { minutes: 20 },
    });
    expect(moved.status()).toBe(204);
    await driver.setViewportSize({ width: 1280, height: 800 });
    await driver.reload();
    const here = side.getByTestId("driver-im-here").getByRole("button");
    await expect(here).toBeVisible();
    await expect(driver.getByTestId("bottom-bar").filter(shown)).toHaveCount(0);
    const hereBox = await box(here);
    expect(hereBox.y).toBeGreaterThanOrEqual((await box(side)).y);
    expect((await box(ticket)).y).toBeGreaterThan(hereBox.y + hereBox.height - 1);
    // With the button over it the column is whole in a window 800 high.
    await expect(async () => {
      expect(await side.evaluate((part) => part.scrollHeight - part.clientHeight)).toBe(0);
    }).toPass({ timeout: 5_000 });
    // In one 720 high the button is still whole and first; the column's
    // last row is then reached by scrolling the column itself.
    await driver.setViewportSize({ width: 1280, height: 720 });
    await expect(here).toBeInViewport({ ratio: 1 });
    const lastRow = rows.getByRole("link").last();
    await lastRow.scrollIntoViewIfNeeded();
    await expect(lastRow).toBeInViewport({ ratio: 1 });
    await expectNoSidewaysScroll(driver);
    await dora.context().close();
  });
});
