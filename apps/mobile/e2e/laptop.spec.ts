import { expect, test, type Locator, type Page } from "@playwright/test";
import { english, signUp } from "./support/account";
import { expectNoSidewaysScroll, laptop, widths } from "./support/laptop";

// The web app on a laptop (spec 18): the top bar's content lines up with the
// page, the logo opens Find, and no screen scrolls sideways at the widths a
// laptop window has. Each wide screen joins here as it is built.

test.skip(({ isMobile }) => isMobile, "Laptop windows; phones have their own journeys.");

/** Screens anyone can open, by the heading that shows they are ready. */
const open = [
  { path: "/", heading: "Where are you going?" },
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
    await expect(page.getByRole("heading", { name: "Hvert ertu að fara?" })).toBeVisible();
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
    const home = bar.getByRole("link", { name: "ShareRide, to the front page" });
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
      .getByRole("link", { name: "ShareRide, to the front page" })
      .click();
    await expect(page.getByRole("heading", { name: "Where are you going?" })).toBeVisible();
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
  "en-GB": { title: "Where are you going?", from: /^From: /, date: /^Date: /, find: "Find a ride" },
  "is-IS": {
    title: "Hvert ertu að fara?",
    from: /^Frá: /,
    date: /^Dagsetning: /,
    find: "Finna far",
  },
} as const;

// Find (spec 18, 3.5): the search in one row across the page, the rides in a
// grid and the offer beside them.
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
        await expectNoSidewaysScroll(page);
      });
    }
  });
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

  test("shows the rides leaving soon in two columns, with the offer beside them", async ({
    page,
  }) => {
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
    const offer = await box(
      page.getByTestId("columns-side").getByRole("button", { name: "Offer a ride" }),
    );
    expect(offer.x).toBeGreaterThan(second.x + second.width);
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
    map: "The trip on a map of Iceland: N1 Borgarnes → Olís Blönduós.",
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
  const trip = page.getByTestId("trip-result").filter({ visible: true }).first();
  await expect(trip).toBeVisible();
  return trip;
}

// Search results (spec 18, 3.6): the trip on our map beside the list, and
// chips that wrap.
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

        // Every chip is whole and inside the list's column: none is reached
        // by scrolling sideways.
        const chips = page.getByTestId("chips-wrap");
        const within = await box(chips);
        const all = await chips.locator('[role="button"], [role="checkbox"]').all();
        expect(all).toHaveLength(5);
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
    trip: "N1 Borgarnes → Olís Blönduós",
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

// Trip details (spec 18, 3.7): your part and who you ride with in the main
// column, with booking and the route beside them.
for (const locale of ["en-GB", "is-IS"] as const) {
  const texts = tripTexts[locale];

  test.describe(`trip details, ${locale}`, () => {
    test.use({ locale });

    for (const width of widths) {
      test(`has booking and the route beside your part, ${String(width)} wide`, async ({
        page,
      }) => {
        await page.setViewportSize(laptop(width));
        await (await searchNorth(page, texts)).click();
        await expect(page.getByRole("heading", { name: texts.trip }).filter(shown)).toBeVisible();

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

        // Get in and Get out stand side by side where the main column has
        // room for both, and one under the other where it has not.
        const [getIn, getOut] = await main.getByTestId("stop-choice").all();
        if (getIn === undefined || getOut === undefined) throw new Error("No stops to choose");
        const inBox = await box(getIn);
        const outBox = await box(getOut);
        if (width >= 1280) {
          expect(outBox.y).toBeCloseTo(inBox.y, 0);
          expect(outBox.x).toBeGreaterThan(inBox.x + inBox.width);
        } else {
          expect(outBox.y).toBeGreaterThan(inBox.y + inBox.height - 1);
          expect(outBox.x).toBeCloseTo(inBox.x, 0);
        }
        await expectNoSidewaysScroll(page);
      });
    }
  });
}

test.describe("trip details and a request", () => {
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
