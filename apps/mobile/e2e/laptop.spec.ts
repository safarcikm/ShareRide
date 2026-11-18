import { expect, test, type Locator } from "@playwright/test";
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
    // The cards of a row are as tall as each other, whatever they hold: a
    // name on two lines in one of them makes both of them taller.
    const cards = page.getByTestId("columns-main").getByTestId("card");
    const heights = await Promise.all(
      (await cards.all()).map(async (card) => (await box(card)).height),
    );
    expect(heights.length).toBeGreaterThanOrEqual(4);
    for (let left = 0; left + 1 < heights.length; left += 2) {
      expect(heights[left + 1]).toBeCloseTo(heights[left] ?? 0, 0);
    }
    expect(new Set(heights.map(Math.round)).size).toBeGreaterThan(1);
    const offer = await box(
      page.getByTestId("columns-side").getByRole("button", { name: "Offer a ride" }),
    );
    expect(offer.x).toBeGreaterThan(second.x + second.width);
  });
});
