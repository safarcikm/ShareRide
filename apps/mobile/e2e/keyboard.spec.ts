import { expect, test, type Page } from "@playwright/test";
import { english, signUp } from "./support/account";

// Where the keyboard is after a press brought something new (spec 31,
// 3.20), on the web build: on the thing itself, so Enter does what a press
// would, and back on the button that opened what has closed again.

test.use({ locale: "en-GB" });

/** What has the keyboard: its element, what it is for a screen reader, and its words. */
const keyboardOn = (page: Page) =>
  page.evaluate(() => {
    const on = document.activeElement;
    if (on === null) return null;
    return {
      tag: on.tagName.toLowerCase(),
      role: on.getAttribute("role"),
      link: on.getAttribute("href"),
      words: on.textContent,
      heading: on.querySelector('h1, h2, [role="heading"]')?.textContent ?? null,
    };
  });

type Point = readonly [typed: string, card: RegExp];

/** Chooses the two ends of a ride on Offer. */
async function chooseEnds(page: Page, from: Point, to: Point) {
  await page.goto("/offer");
  const choose = async (end: "From" | "To", [typed, name]: Point) => {
    await page.getByRole("button", { name: new RegExp(`^${end}: `) }).click();
    await page.getByLabel(end, { exact: true }).fill(typed);
    await page.getByRole("button", { name }).click();
  };
  await choose("From", from);
  await choose("To", to);
}

test("after Show all drafts the keyboard is on the draft that came, and Enter opens it", async ({
  page,
}) => {
  test.slow();
  await signUp(page, english, "Gunnar");
  // Four rides started and left: three show, and the fourth comes on a press.
  const mjodd: Point = ["mjódd", /^Mjódd bus terminal,/];
  const selfoss: Point = ["selfo", /^N1 Selfoss,/];
  for (const [from, to] of [
    [selfoss, ["hella", /^N1 Hella,/]],
    [
      ["bs", /^BSÍ bus terminal,/],
      ["borgar", /^N1 Borgarnes,/],
    ],
    [mjodd, ["hverag", /^N1 Hveragerði,/]],
    [mjodd, selfoss],
  ] as const) {
    await chooseEnds(page, from, to);
    await page.getByRole("button", { name: "Choose date and time" }).click();
    await expect(page.getByRole("heading", { name: "When are you leaving?" })).toBeVisible();
  }
  await page.goto("/offer");
  const drafts = page.getByTestId("draft-rows").filter({ visible: true });
  await expect(drafts.getByRole("link")).toHaveCount(3);
  const all = drafts.getByRole("button", { name: "Show all drafts" });
  await all.focus();
  await page.keyboard.press("Enter");
  await expect(drafts.getByRole("link")).toHaveCount(4);
  // The draft changed longest ago is the one that came: its link has the keyboard.
  const fourth = drafts.getByRole("link").nth(3);
  const address = await fourth.getAttribute("href");
  expect(address).toMatch(/^\/drive\/trips\/[0-9a-f-]+\/time$/);
  await expect.poll(() => keyboardOn(page)).toMatchObject({ link: address });
  expect((await keyboardOn(page))?.words).toContain("N1 Selfoss → N1 Hella");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${address ?? ""}$`));
});

test("adding a meeting point moves the keyboard to its screen, and Back puts it on the button again", async ({
  page,
}) => {
  await signUp(page, english, "Halla");
  await chooseEnds(page, ["mjódd", /^Mjódd bus terminal,/], ["selfo", /^N1 Selfoss,/]);
  const step = "Where are you driving?";
  await expect(page.getByRole("heading", { name: step })).toBeVisible();
  const add = page.getByRole("button", { name: "Add a meeting point", exact: true });
  await add.focus();
  await page.keyboard.press("Enter");
  // The step gave way to choosing a point: the keyboard is on that screen's title.
  await expect(page.getByRole("heading", { name: step })).toHaveCount(0);
  // (Not on the page as a whole, which holds that title too.)
  await expect
    .poll(() => keyboardOn(page))
    .toMatchObject({ tag: "div", words: "Add a meeting point", heading: "Add a meeting point" });
  // Back closes it with nothing chosen, and the button that opened it has the keyboard.
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("heading", { name: step })).toBeVisible();
  await expect
    .poll(() => keyboardOn(page))
    .toMatchObject({ role: "button", words: "Add a meeting point" });
  // So Enter opens it again.
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: step })).toHaveCount(0);
});
