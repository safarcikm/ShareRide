import { expect, type Page } from "@playwright/test";

// Finding a sample trip through the search, for journeys that book.

/** The search texts and what to pick, in one language. */
export interface TripSearch {
  readonly fromField: RegExp;
  readonly from: string;
  readonly fromPoint: RegExp;
  readonly toField: RegExp;
  readonly to: string;
  readonly toPoint: RegExp;
  /** The place field's label. */
  readonly field: string;
  readonly search: string;
  /** The result to open: the earliest that matches. */
  readonly result: RegExp;
}

/** Searches the part and opens the trip from the results; returns its ID. */
export async function openTrip(page: Page, search: TripSearch) {
  await page.goto("/search");
  for (const [field, typed, point] of [
    [search.fromField, search.from, search.fromPoint],
    [search.toField, search.to, search.toPoint],
  ] as const) {
    await page.getByRole("button", { name: field }).click();
    await page.getByLabel(search.field).fill(typed);
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
