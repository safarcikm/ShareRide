import { expect, type Page } from "@playwright/test";
import { formatDay, type Locale } from "@shareride/i18n";
import { addPhotoBeforePublishing } from "./photo";

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

/** The names on a time's wheel, in one language. */
export interface WheelTexts {
  readonly hour: string;
  readonly minutes: string;
  readonly done: string;
}

export const englishWheel: WheelTexts = { hour: "Hour", minutes: "Minutes", done: "Done" };

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/**
 * The field of the time named `label`, by its name and time: "Leaving BSÍ
 * bus terminal at: 09:00" in English, "Brottför frá BSÍ kl. 09:00" in
 * Icelandic.
 */
export const timeField = (page: Page, label: string) =>
  page.getByRole("button", { name: new RegExp(`^${escapeRegExp(label)}:? `, "u") });

/**
 * Opens the wheel of the time named `label`, taps the hour and the minutes
 * of `time` ("09:00") in it, and closes it with Done.
 */
export async function chooseTime(
  page: Page,
  label: string,
  time: string,
  texts: WheelTexts = englishWheel,
) {
  const [hour = "", minute = ""] = time.split(":");
  await timeField(page, label).click();
  await page.getByRole("spinbutton", { name: texts.hour }).getByText(hour, { exact: true }).click();
  await page
    .getByRole("spinbutton", { name: texts.minutes })
    .getByText(minute, { exact: true })
    .click();
  await expect(page.getByRole("spinbutton", { name: texts.hour })).toHaveAttribute(
    "aria-valuetext",
    hour,
  );
  await expect(page.getByRole("spinbutton", { name: texts.minutes })).toHaveAttribute(
    "aria-valuetext",
    minute,
  );
  await page.getByRole("button", { name: texts.done, exact: true }).click();
}

/**
 * Drags the price level's handle along its track to the dot of `level`, in
 * small moves as a hand makes them: with a finger where the page takes
 * touches (the phone project), with the mouse elsewhere. The finger strays
 * up and down on the way, and the page must not scroll for it.
 */
export async function dragPriceTo(page: Page, level: number) {
  const track = page.getByTestId("price-track").filter({ visible: true });
  await track.scrollIntoViewIfNeeded();
  const centre = async (testId: string) => {
    const box = await track.getByTestId(testId).boundingBox();
    if (box === null) throw new Error(`${testId} is not on show`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const from = await centre("price-handle");
  const to = await centre(`price-step-${String(level)}`);
  const moves = 8;
  const along = (index: number) => ({
    x: from.x + ((to.x - from.x) * index) / moves,
    y: from.y + (index === moves / 2 ? 20 : 0),
  });
  const scroll = page.getByTestId("screen-scroll").filter({ visible: true });
  const scrolledBefore = await scroll.evaluate((element) => element.scrollTop);
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) {
    const cdp = await page.context().newCDPSession(page);
    const touch = (
      type: "touchStart" | "touchMove" | "touchEnd",
      point: { x: number; y: number } | null,
    ) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: point === null ? [] : [{ x: point.x, y: point.y }],
      });
    await touch("touchStart", from);
    for (let index = 1; index <= moves; index += 1) await touch("touchMove", along(index));
    await touch("touchEnd", null);
    await cdp.detach();
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let index = 1; index <= moves; index += 1) {
      const point = along(index);
      await page.mouse.move(point.x, point.y);
    }
    await page.mouse.up();
  }
  expect(await scroll.evaluate((element) => element.scrollTop)).toBe(scrolledBefore);
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
 * English, keeping the suggested price and seats, with the photo, car and
 * licence added on the way; returns the trip's ID. The stops on the way
 * that the app suggests stay, except those named in `skip`.
 */
export async function postTripToSelfoss(
  page: Page,
  departure: string,
  skip: readonly string[] = [],
  /** The driver has posted before: their photo, car and licence are in place. */
  ready = false,
) {
  const choose = async (end: "From" | "To", typed: string, card: RegExp) => {
    await page.getByRole("button", { name: new RegExp(`^${end}: `) }).click();
    await page.getByLabel(end, { exact: true }).fill(typed);
    await page.getByRole("button", { name: card }).click();
  };
  await page.goto("/offer");
  await expect(page.getByRole("heading", { name: "Where are you driving?" })).toBeVisible();
  await choose("From", "mjódd", /^Mjódd bus terminal,/);
  await choose("To", "selfo", /^N1 Selfoss,/);
  for (const stop of skip) await page.getByRole("switch", { name: stop }).click();
  await page.getByRole("button", { name: "Choose date and time" }).click();
  const day = tomorrow("en");
  if (day.nextMonth) await page.getByRole("button", { name: "Next month" }).click();
  await page.getByRole("radio", { name: day.name }).click();
  await chooseTime(page, "Leaving Mjódd bus terminal at", departure);
  await page.getByRole("button", { name: "Choose seats" }).click();
  await page.getByRole("button", { name: "Set your price" }).click();
  await page.getByRole("button", { name: "Check your ride" }).click();
  if (ready) return publish(page);
  await addPhotoBeforePublishing(page);
  await page.getByRole("button", { name: "Add a car" }).click();
  await page.getByLabel("Make").fill("Toyota");
  await page.getByLabel("Model").fill("Yaris");
  await page.getByRole("radio", { name: "White" }).click();
  await page.getByRole("button", { name: "Save car" }).click();
  await page.getByRole("button", { name: "Confirm your licence" }).click();
  await page
    .getByRole("checkbox", {
      name: "I declare that I hold a valid driving licence for the cars I drive on PuffinRide",
    })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  return publish(page);
}

/** Publishes the trip under review; its ID. */
async function publish(page: Page) {
  await page.getByRole("button", { name: "Publish ride" }).click();
  await expect(page.getByRole("heading", { name: "Your ride is published" })).toBeVisible();
  const [, id] = /\/drive\/trips\/([0-9a-f-]+)\/published/.exec(page.url()) ?? [];
  return id ?? "";
}
