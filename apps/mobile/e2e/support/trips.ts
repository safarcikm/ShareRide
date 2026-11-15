import { expect, type Page } from "@playwright/test";
import { formatDay, type Locale } from "@shareride/i18n";

// Finding a sample trip through the search, for journeys that book, and
// posting one as a new driver, for journeys that answer requests.

/** The search texts and what to pick, in one language. */
export interface TripSearch {
  readonly fromField: RegExp;
  readonly from: string;
  readonly fromPoint: RegExp;
  readonly toField: RegExp;
  readonly to: string;
  readonly toPoint: RegExp;
  /** The names of the fields that drop down under From and To. */
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly search: string;
  /** The result to open: the earliest that matches. */
  readonly result: RegExp;
}

/** Searches the part and opens the trip from the results; returns its ID. */
export async function openTrip(page: Page, search: TripSearch) {
  await page.goto("/search");
  for (const [field, label, typed, point] of [
    [search.fromField, search.fromLabel, search.from, search.fromPoint],
    [search.toField, search.toLabel, search.to, search.toPoint],
  ] as const) {
    await page.getByRole("button", { name: field }).click();
    await page.getByLabel(label, { exact: true }).fill(typed);
    await page.getByRole("button", { name: point }).click();
  }
  await page.getByRole("button", { name: search.search, exact: true }).click();
  await page.getByRole("button", { name: search.result }).first().click();
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]+\?from=\d&to=\d$/);
  const [, id] = /\/trips\/([0-9a-f-]+)/.exec(page.url()) ?? [];
  return id ?? "";
}

/** The text of what has keyboard and screen-reader focus. */
export const focused = (page: Page) =>
  page.evaluate(() => document.activeElement?.textContent ?? "");

/** Tomorrow in Iceland, as the calendar names it, and whether it is next month. */
export function tomorrow(locale: Locale) {
  const now = new Date();
  const then = new Date(now.getTime() + 24 * 3600 * 1000);
  const month = (moment: Date) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "Atlantic/Reykjavik", month: "numeric" }).format(
      moment,
    );
  return { name: formatDay(then, locale), nextMonth: month(then) !== month(now) };
}

/**
 * Posts Mjódd to N1 Selfoss tomorrow at `departure` as a new driver, in
 * English, keeping the suggested price and seats, with the car and licence
 * added on the way; returns the trip's ID.
 */
export async function postTripToSelfoss(page: Page, departure: string) {
  const choose = async (end: "From" | "To", typed: string, card: RegExp) => {
    await page.getByRole("button", { name: new RegExp(`^${end}: `) }).click();
    await page.getByLabel(end, { exact: true }).fill(typed);
    await page.getByRole("button", { name: card }).click();
  };
  await page.goto("/drive");
  await page.getByRole("button", { name: "Post a trip" }).click();
  await choose("From", "mjódd", /^Mjódd bus terminal,/);
  await choose("To", "selfo", /^N1 Selfoss,/);
  await page.getByRole("button", { name: "Choose date and time" }).click();
  const day = tomorrow("en");
  if (day.nextMonth) await page.getByRole("button", { name: "Next month" }).click();
  await page.getByRole("radio", { name: day.name }).click();
  await page.getByLabel("Leaving Mjódd bus terminal at").fill(departure);
  await page.getByRole("button", { name: "Set your price" }).click();
  await page.getByRole("button", { name: "Choose seats" }).click();
  await page.getByRole("button", { name: "Review your trip" }).click();
  await page.getByRole("button", { name: "Add a car" }).click();
  await page.getByLabel("Make").fill("Toyota");
  await page.getByLabel("Model").fill("Yaris");
  await page.getByRole("radio", { name: "White" }).click();
  await page.getByRole("button", { name: "Save car" }).click();
  await page.getByRole("button", { name: "Confirm your licence" }).click();
  await page
    .getByRole("checkbox", {
      name: "I declare that I hold a valid driving licence for the cars I drive on ShareRide",
    })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await page.getByRole("button", { name: "Publish trip" }).click();
  await expect(page.getByRole("heading", { name: "Your trip is published" })).toBeVisible();
  const [, id] = /\/drive\/trips\/([0-9a-f-]+)\/published/.exec(page.url()) ?? [];
  return id ?? "";
}
