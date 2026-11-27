import { expect, test, type Page } from "@playwright/test";
import { focused } from "./support/trips";

// Spec 4's search on the web build, without an account, against the sample
// trips the e2e API seeds: Anna drives Reykjavík to Akureyri tomorrow at
// 09:00, through Borgarnes and Blönduós. The posting journey publishes the
// same route next month, also as an Anna, so the checks take the earliest.

interface Journey {
  readonly locale: string;
  readonly title: string;
  readonly from: RegExp;
  readonly to: RegExp;
  /** The names of the fields that drop down under From and To. */
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly borgarnes: RegExp;
  readonly blonduos: RegExp;
  readonly submit: string;
  /** The results header, one button that opens the search in place (spec 16, 3.8). */
  readonly header: string;
  readonly changeSearch: string;
  readonly findRide: string;
  readonly summary: string;
  readonly result: RegExp;
  readonly partOf: string;
  readonly seatsLeft: string;
  readonly recent: string;
  /** The one row over the rides, and the card that ends them (spec 31, 3.6). */
  readonly sort: string;
  readonly filters: string;
  readonly instantOnly: string;
  readonly oneFilter: string;
  readonly rides: RegExp;
  readonly everyRide: string;
  readonly allRides: string;
}

const journeys: readonly Journey[] = [
  {
    locale: "en-GB",
    title: "Find a ride",
    from: /^From: /,
    to: /^To: /,
    fromLabel: "From",
    toLabel: "To",
    borgarnes: /^N1 Borgarnes,/,
    blonduos: /^Olís Blönduós,/,
    submit: "Find a ride",
    header: "Change search: N1 Borgarnes → Olís Blönduós, Any day, 1 seat",
    changeSearch: "Change search",
    findRide: "Find a ride",
    summary: "Any day, 1 seat",
    result: /^Leaves N1 Borgarnes at \d\d:\d\d, .*Anna, New driver/,
    partOf: "Anna drives BSÍ bus terminal → Hof bus stop, Akureyri",
    seatsLeft: "3 seats left",
    recent: "Recent searches",
    sort: "Sort: Earliest",
    filters: "Filters",
    instantOnly: "Book instantly only",
    oneFilter: "Filters: 1 on",
    rides: /^\d+ rides?$/,
    everyRide: "That's every ride found",
    allRides: "All rides",
  },
  {
    locale: "is-IS",
    title: "Finna far",
    from: /^Frá: /,
    to: /^Til: /,
    fromLabel: "Frá",
    toLabel: "Til",
    borgarnes: /^N1 Borgarnesi,/,
    blonduos: /^Olís Blönduósi,/,
    submit: "Finna far",
    header: "Breyta leit: N1 Borgarnesi → Olís Blönduósi, Allir dagar, 1 sæti",
    changeSearch: "Breyta leit",
    findRide: "Finna far",
    summary: "Allir dagar, 1 sæti",
    result: /^N1 Borgarnesi, brottför kl\. \d\d:\d\d, .*Anna, Nýr ökumaður/,
    partOf: "Anna ekur BSÍ → Hof, Akureyri",
    seatsLeft: "3 sæti laus",
    recent: "Nýlegar leitir",
    sort: "Röðun: Fyrst",
    filters: "Síur",
    instantOnly: "Aðeins bókun strax",
    oneFilter: "Síur: 1 virk",
    rides: /^\d+ ferð(ir)?$/,
    everyRide: "Ekki fundust fleiri ferðir",
    allRides: "Allar ferðir",
  },
];

async function choose(page: Page, field: RegExp, label: string, typed: string, name: RegExp) {
  await page.getByRole("button", { name: field }).click();
  await page.getByLabel(label, { exact: true }).fill(typed);
  await page.getByRole("button", { name }).click();
}

for (const journey of journeys) {
  test.describe(`search without an account (${journey.locale})`, () => {
    test.use({ locale: journey.locale });

    test("Borgarnes to Blönduós finds Reykjavík to Akureyri", async ({ page }) => {
      await page.goto("/search");
      await expect(page.getByRole("heading", { name: journey.title })).toBeVisible();

      await choose(page, journey.from, journey.fromLabel, "borgarn", journey.borgarnes);
      await choose(page, journey.to, journey.toLabel, "blondu", journey.blonduos);
      await page.getByRole("button", { name: journey.submit, exact: true }).click();

      const header = page.getByRole("button", { name: journey.header });
      await expect(header).toBeVisible();
      // The button is inside the screen's heading, so the screen keeps an h1.
      await expect(
        page.getByRole("heading", { level: 1, name: journey.header }).filter({ visible: true }),
      ).toBeVisible();
      // The header opens the search in place, filled in; Find a ride searches again.
      await header.click();
      await expect(page.getByRole("heading", { name: journey.changeSearch })).toBeVisible();
      await page
        .getByRole("button", { name: journey.findRide, exact: true })
        .filter({ visible: true })
        .click();
      await expect(header).toBeVisible();
      await expect.poll(() => focused(page)).toContain(journey.summary);
      // The form stays in the page under the results, its recent search too.
      await expect(page.getByText(journey.summary).filter({ visible: true })).toBeVisible();
      const result = page.getByLabel(journey.result).first();
      await expect(result).toBeVisible();
      await expect(result.getByText(journey.partOf)).toBeVisible();
      await expect(result.getByText(journey.seatsLeft)).toBeVisible();

      // One row over the rides: the order, Filters and how many rides there
      // are, the count at the row's right. Find stays in the page under the
      // results, so the row is looked for on the results only.
      const results = page
        .getByTestId("screen-scroll")
        .filter({ has: page.getByTestId("results-heading") });
      const row = results.getByTestId("results-row");
      await expect(row.getByRole("button", { name: journey.sort, exact: true })).toBeVisible();
      const count = row.getByText(journey.rides);
      await expect(count).toBeVisible();
      const rowBox = await row.boundingBox();
      const countBox = await count.boundingBox();
      expect((countBox?.x ?? 0) + (countBox?.width ?? 0)).toBeCloseTo(
        (rowBox?.x ?? 0) + (rowBox?.width ?? 0),
        0,
      );
      expect(countBox?.y).toBeLessThan((rowBox?.y ?? 0) + 44);
      // Filters opens today's filters under the row, and counts the ones on.
      const filters = row.getByRole("button", { name: journey.filters, exact: true });
      await expect(filters).toHaveAttribute("aria-expanded", "false");
      await filters.click();
      const instant = results.getByRole("checkbox", { name: journey.instantOnly });
      await instant.click();
      await expect(row.getByRole("button", { name: journey.oneFilter })).toBeVisible();
      await instant.click();
      await expect(filters).toHaveAttribute("aria-expanded", "true");
      await expect(result).toBeVisible();
      // The list ends with a card that leads to every ride leaving soon.
      const end = results.getByTestId("results-end");
      await expect(end.getByText(journey.everyRide, { exact: true })).toBeVisible();
      await expect(end.getByRole("link", { name: journey.allRides })).toHaveAttribute(
        "href",
        "/rides",
      );

      // The search is kept on this device for one-tap repeat.
      await page.goBack();
      await expect(page.getByRole("heading", { name: journey.recent })).toBeVisible();
      // Opened afresh rather than reloaded: in CI a reload straight after Back
      // once opened the results again, the address not yet back at the form.
      await page.goto("/search");
      await expect(page.getByRole("heading", { name: journey.recent })).toBeVisible();
    });
  });
}
