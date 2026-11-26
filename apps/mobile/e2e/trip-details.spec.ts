import { expect, test, type Page } from "@playwright/test";

// Spec 4's trip details and shared links on the web build, without an
// account, against the sample trips the e2e API seeds: Anna drives
// Reykjavík to Akureyri tomorrow at 09:00 UTC, through Borgarnes and
// Blönduós, with 3 seats. The posting journey publishes the same route next
// month, so the checks open the earliest.

async function choose(page: Page, end: "From" | "To", typed: string, name: RegExp) {
  await page.getByRole("button", { name: new RegExp(`^${end}: `) }).click();
  await page.getByLabel(end, { exact: true }).fill(typed);
  await page.getByRole("button", { name }).click();
}

test.describe("ride details without an account", () => {
  test.use({ locale: "en-GB", permissions: ["clipboard-read", "clipboard-write"] });

  test("opens a trip from the search, changes where to get in and shares it", async ({
    page,
    browser,
  }) => {
    await page.goto("/search");
    await choose(page, "From", "borgarn", /^N1 Borgarnes,/);
    await choose(page, "To", "blondu", /^Olís Blönduós,/);
    await page.getByRole("button", { name: "Find a ride", exact: true }).click();
    // The icon in a result's corner copies the part's link, and the results stay (spec 28, 3.1).
    await page
      .getByRole("button", { name: "Share the ride N1 Borgarnes → Olís Blönduós" })
      .first()
      .click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toMatch(/^http:\/\/localhost:8082\/trips\/[0-9a-f-]+\?from=1&to=2$/);
    await expect(page).toHaveURL(/\/search\/results\?/);
    await page
      .getByRole("button", { name: /^Leaves N1 Borgarnes at \d\d:\d\d, .*Anna, New driver/ })
      .first()
      .click();

    await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+\?from=1&to=2$/);
    await expect(
      page
        .getByRole("heading", { name: "N1 Borgarnes to Olís Blönduós" })
        .filter({ visible: true }),
    ).toBeVisible();
    // Your part is one ticket, named as a part of the screen (spec 31, 3.7).
    const ticket = page.getByTestId("part-ticket").filter({ visible: true });
    await expect(ticket.getByRole("heading", { name: "Your part of the ride" })).toBeVisible();
    await expect(
      page.getByRole("img", {
        name: "Seats on your part: 3 offered, 0 taken, 1 yours and 2 free.",
      }),
    ).toBeVisible();
    // A phone has the price in the bar at the bottom; a laptop beside the seats.
    await expect(
      page.getByText(
        test.info().project.name === "phone"
          ? /^3 free on your part$/
          : /^3 free on your part · [\d,]+ ISK per seat$/,
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("img", {
        name: /^The ride on a map of Iceland: .+\. Your part: N1 Borgarnes → Olís Blönduós\.$/,
      }),
    ).toBeVisible();
    // A stop off the part is no taller than one on it: the dotted line fits its row.
    const heights = await page
      .getByTestId("route-stop")
      .filter({ visible: true })
      .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height));
    expect(heights).toHaveLength(4);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(2);
    await expect(page.getByText("White Toyota Yaris")).toBeVisible();
    if (test.info().project.name === "phone") {
      // A row's value goes under its title where the two have no room on one
      // line: the title is never broken for it (spec 15, 5.2).
      const [paying, weather] = await Promise.all(
        ["Free cancellation", "Weather and roads"].map((title) =>
          page.getByText(title, { exact: true }).filter({ visible: true }).boundingBox(),
        ),
      );
      expect(paying?.height).toBe(weather?.height);
    }
    await expect(page.getByRole("button", { name: "Send request" })).toBeEnabled();
    // Trip pages ask search engines not to index them (R4.6).
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, nofollow",
    );

    // Get in at the first stop instead: Change on the ticket unfolds the
    // stops to get in at, and choosing one folds them again.
    await ticket.getByRole("button", { name: "Change where you get in" }).click();
    const choices = ticket.getByRole("radiogroup", { name: "Where you get in" });
    await expect(choices.getByRole("radio")).toHaveCount(2);
    await choices.getByRole("radio", { name: /^\d\d:\d\d, BSÍ bus terminal$/ }).click();
    await expect(choices).toHaveCount(0);
    await expect(
      page
        .getByRole("heading", { name: "BSÍ bus terminal to Olís Blönduós" })
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\?from=0&to=2$/);

    // The whole route does the same from a stop: back to Borgarnes, and out again.
    await page.getByRole("button", { name: /^\d\d:\d\d, N1 Borgarnes, on your part$/ }).click();
    await page.getByRole("button", { name: "Get in here" }).click();
    await expect(page).toHaveURL(/\?from=1&to=2$/);
    await page
      .getByRole("button", { name: /^\d\d:\d\d, BSÍ bus terminal, not on your part$/ })
      .click();
    await page.getByRole("button", { name: "Get in here" }).click();
    await expect(page).toHaveURL(/\?from=0&to=2$/);

    // Share copies the link, which opens the same part in another browser.
    await page.getByRole("button", { name: "Share", exact: true }).click();
    // The results' card said the same to screen readers; that screen is hidden now.
    await expect(
      page.getByText("Link copied. Paste it wherever you like.").filter({ visible: true }),
    ).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/^http:\/\/localhost:8082\/trips\/[0-9a-f-]+\?from=0&to=2$/);

    const other = await browser.newContext({ locale: "is-IS" });
    try {
      const elsewhere = await other.newPage();
      await elsewhere.goto(link);
      await expect(
        elsewhere.getByRole("heading", { name: "BSÍ → Olís Blönduósi" }).filter({ visible: true }),
      ).toBeVisible();
      await expect(
        elsewhere.getByRole("heading", { name: "Þinn hluti ferðarinnar" }),
      ).toBeVisible();
      await expect(elsewhere.getByText("Hvítur Toyota Yaris")).toBeVisible();
    } finally {
      await other.close();
    }
  });
});
