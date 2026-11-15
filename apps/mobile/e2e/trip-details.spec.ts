import { expect, test, type Page } from "@playwright/test";

// Spec 4's trip details and shared links on the web build, without an
// account, against the sample trips the e2e API seeds: Anna drives
// Reykjavík to Akureyri tomorrow at 09:00 UTC, through Borgarnes and
// Blönduós, with 3 seats. The posting journey publishes the same route next
// month, so the checks open the earliest.

async function choose(page: Page, field: RegExp, typed: string, name: RegExp) {
  await page.getByRole("button", { name: field }).click();
  await page.getByLabel("Town or meeting point").fill(typed);
  await page.getByRole("button", { name }).click();
}

test.describe("trip details without an account", () => {
  test.use({ locale: "en-GB", permissions: ["clipboard-read", "clipboard-write"] });

  test("opens a trip from the search, changes where to get in and shares it", async ({
    page,
    browser,
  }) => {
    await page.goto("/search");
    await choose(page, /^From: /, "borgarn", /^N1 Borgarnes,/);
    await choose(page, /^To: /, "blondu", /^Olís Blönduós,/);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page
      .getByRole("button", { name: /^Leaves N1 Borgarnes at \d\d:\d\d, .*Anna, New driver/ })
      .first()
      .click();

    await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+\?from=1&to=2$/);
    await expect(
      page.getByRole("heading", { name: "N1 Borgarnes → Olís Blönduós" }).filter({ visible: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", {
        name: "Seats on your part: 3 offered, 0 taken, 1 yours and 2 free.",
      }),
    ).toBeVisible();
    await expect(page.getByText("3 of 3 seats free on your part")).toBeVisible();
    await expect(
      page.getByRole("img", {
        name: /^The trip on a map of Iceland: .+\. Your part: N1 Borgarnes → Olís Blönduós\.$/,
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
    await expect(page.getByRole("button", { name: "Send request" })).toBeEnabled();
    // Trip pages ask search engines not to index them (R4.6).
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, nofollow",
    );

    // Get in at the first stop instead.
    await page
      .getByRole("button", { name: /^\d\d:\d\d, BSÍ bus terminal, not on your part$/ })
      .click();
    await page.getByRole("button", { name: "Get in here" }).click();
    await expect(
      page
        .getByRole("heading", { name: "BSÍ bus terminal → Olís Blönduós" })
        .filter({ visible: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\?from=0&to=2$/);

    // Share copies the link, which opens the same part in another browser.
    await page.getByRole("button", { name: "Share" }).click();
    await expect(page.getByText("Link copied. Paste it wherever you like.")).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/^http:\/\/localhost:8082\/trips\/[0-9a-f-]+\?from=0&to=2$/);

    const other = await browser.newContext({ locale: "is-IS" });
    try {
      const elsewhere = await other.newPage();
      await elsewhere.goto(link);
      await expect(
        elsewhere.getByRole("heading", { name: "BSÍ → Olís Blönduósi" }).filter({ visible: true }),
      ).toBeVisible();
      await expect(elsewhere.getByText("Þinn hluti ferðarinnar")).toBeVisible();
      await expect(elsewhere.getByText("Hvítur Toyota Yaris")).toBeVisible();
    } finally {
      await other.close();
    }
  });
});
