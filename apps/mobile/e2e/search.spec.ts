import { expect, test, type Page } from "@playwright/test";

// Spec 4's search on the web build, without an account, against the sample
// trips the e2e API seeds: Anna drives Reykjavík to Akureyri tomorrow at
// 09:00, through Borgarnes and Blönduós. The posting journey publishes the
// same route next month, also as an Anna, so the checks take the earliest.

interface Journey {
  readonly locale: string;
  readonly title: string;
  readonly from: RegExp;
  readonly to: RegExp;
  readonly field: string;
  readonly borgarnes: RegExp;
  readonly blonduos: RegExp;
  readonly submit: string;
  readonly header: string;
  readonly summary: string;
  readonly result: RegExp;
  readonly partOf: string;
  readonly seatsLeft: string;
  readonly recent: string;
}

const journeys: readonly Journey[] = [
  {
    locale: "en-GB",
    title: "Find a ride",
    from: /^From: /,
    to: /^To: /,
    field: "Town or meeting point",
    borgarnes: /^N1 Borgarnes,/,
    blonduos: /^Olís Blönduós,/,
    submit: "Search",
    header: "N1 Borgarnes → Olís Blönduós",
    summary: "Any day, 1 seat",
    result: /^Leaves N1 Borgarnes at \d\d:\d\d, .*Anna, New driver/,
    partOf: "Part of BSÍ bus terminal → Hof bus stop, Akureyri",
    seatsLeft: "3 seats left",
    recent: "Recent searches",
  },
  {
    locale: "is-IS",
    title: "Finna far",
    from: /^Frá: /,
    to: /^Til: /,
    field: "Bær eða mótsstaður",
    borgarnes: /^N1 Borgarnesi,/,
    blonduos: /^Olís Blönduósi,/,
    submit: "Leita",
    header: "N1 Borgarnesi → Olís Blönduósi",
    summary: "Hvaða dag sem er, 1 sæti",
    result: /^N1 Borgarnesi, brottför kl\. \d\d:\d\d, .*Anna, Nýr ökumaður/,
    partOf: "Hluti af BSÍ → Hof, Akureyri",
    seatsLeft: "3 sæti laus",
    recent: "Nýlegar leitir",
  },
];

async function choose(page: Page, field: RegExp, label: string, typed: string, name: RegExp) {
  await page.getByRole("button", { name: field }).click();
  await page.getByLabel(label).fill(typed);
  await page.getByRole("button", { name }).click();
}

for (const journey of journeys) {
  test.describe(`search without an account (${journey.locale})`, () => {
    test.use({ locale: journey.locale });

    test("Borgarnes to Blönduós finds Reykjavík to Akureyri", async ({ page }) => {
      await page.goto("/search");
      await expect(page.getByRole("heading", { name: journey.title })).toBeVisible();

      await choose(page, journey.from, journey.field, "borgarn", journey.borgarnes);
      await choose(page, journey.to, journey.field, "blondu", journey.blonduos);
      await page.getByRole("button", { name: journey.submit, exact: true }).click();

      await expect(page.getByRole("heading", { name: journey.header })).toBeVisible();
      // The form stays in the page under the results, its recent search too.
      await expect(page.getByText(journey.summary).filter({ visible: true })).toBeVisible();
      const result = page.getByLabel(journey.result).first();
      await expect(result).toBeVisible();
      await expect(result.getByText(journey.partOf)).toBeVisible();
      await expect(result.getByText(journey.seatsLeft)).toBeVisible();

      // The search is kept on this device for one-tap repeat.
      await page.goBack();
      await expect(page.getByRole("heading", { name: journey.recent })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("heading", { name: journey.recent })).toBeVisible();
    });
  });
}
