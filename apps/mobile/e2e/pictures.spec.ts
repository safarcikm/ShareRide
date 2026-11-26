import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { english, signUp } from "./support/account";
import { postTripToSelfoss } from "./support/trips";

// Pictures of screens for the specs (docs/specs/images), kept in git with
// the script that makes them. Not a check: skipped unless PICTURES_DIR names
// the folder to write to, as in
//   PICTURES_DIR=../../docs/specs/images npx playwright test e2e/pictures.spec.ts

const env = process.env as Readonly<Record<string, string | undefined>>;
const root = env["PICTURES_DIR"];

async function choose(page: Page, end: "From" | "To", typed: string, name: RegExp) {
  await page.getByRole("button", { name: new RegExp(`^${end}: `) }).click();
  await page.getByLabel(end, { exact: true }).fill(typed);
  await page.getByRole("button", { name }).click();
}

/** Makes the window as tall as the open screen, which scrolls inside the page, to draw all of it. */
async function showWhole(page: Page, width: number) {
  const scroll = page.getByTestId("screen-scroll").filter({ visible: true });
  // The screen's top too: on a laptop the page's header is above it.
  const height = await scroll.evaluate(
    (element) => element.getBoundingClientRect().top + element.scrollHeight,
  );
  await page.setViewportSize({ width, height: Math.max(Math.ceil(height), 720) });
  await page.waitForTimeout(500);
}

test.describe("pictures", () => {
  test.skip(root === undefined, "PICTURES_DIR is not set");
  test.use({
    locale: "en-GB",
    permissions: ["clipboard-read", "clipboard-write"],
    deviceScaleFactor: 2,
  });

  test("share a ride (spec 28)", async ({ page }, info) => {
    const folder = join(root ?? "", "share-a-ride");
    mkdirSync(folder, { recursive: true });
    const kind = info.project.name;
    const wide = kind === "desktop";
    if (wide) await page.setViewportSize({ width: 1280, height: 720 });

    // The front page's rides leaving soon, each with the icon in its corner.
    await page.goto("/");
    await page.getByRole("heading", { name: "Leaving soon" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    if (wide) await page.screenshot({ path: join(folder, "front-page-laptop.png") });

    // A search result, then its link copied.
    await page.goto("/search");
    await choose(page, "From", "borgarn", /^N1 Borgarnes,/);
    await choose(page, "To", "blondu", /^Olís Blönduós,/);
    await page.getByRole("button", { name: "Find a ride", exact: true }).click();
    const icon = page.getByRole("button", { name: /^Share the ride / }).first();
    await icon.waitFor();
    await page.waitForTimeout(500);
    const card = page.getByTestId("card-with-corner").filter({ visible: true }).first();
    if (!wide) {
      await card.screenshot({ path: join(folder, "result-card-phone.png") });
    }
    await icon.hover();
    await icon.click();
    await expect(page.getByTestId("share-copied")).toBeVisible();
    if (wide) await page.screenshot({ path: join(folder, "link-copied-laptop.png") });
  });

  test("share this ride (spec 28)", async ({ page }, info) => {
    test.setTimeout(120_000);
    const folder = join(root ?? "", "share-a-ride");
    mkdirSync(folder, { recursive: true });
    const wide = info.project.name === "desktop";
    if (wide) await page.setViewportSize({ width: 1280, height: 720 });
    await signUp(page, english, "Bára");
    const tripId = await postTripToSelfoss(page, "09:00");

    // After publishing, on a phone, in English. The screen scrolls inside
    // the page, so a window as tall as the screen shows all of it.
    if (!wide) {
      await expect(page.getByRole("heading", { name: "Share this ride" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Story on Instagram" })).toBeVisible();
      await expect(page.locator('[style*="blob:"]')).toBeVisible();
      await showWhole(page, 412);
      await page.screenshot({ path: join(folder, "published-phone.png") });
      // The story section: from its heading to Copy link.
      const top = await page.getByRole("heading", { name: "Story on Instagram" }).boundingBox();
      const end = await page.getByRole("button", { name: "Copy link" }).boundingBox();
      if (top === null || end === null) throw new Error("The story section is not there");
      await page.screenshot({
        path: join(folder, "story-section-phone.png"),
        clip: { x: 0, y: top.y - 16, width: 412, height: end.y + end.height - top.y + 32 },
      });
      // The icon beside the trip's name on the driver's trip page, and in
      // the corner of the trip in My trips.
      await page.setViewportSize({ width: 412, height: 839 });
      await page.goto(`/drive/trips/${tripId}`);
      await expect(page.getByRole("button", { name: "Share this ride" })).toBeVisible();
      await page.waitForTimeout(500);
      await page.screenshot({
        path: join(folder, "trip-page-head-phone.png"),
        clip: { x: 0, y: 0, width: 412, height: 260 },
      });
      await page.goto("/drive/trips");
      const mine = page.getByRole("button", { name: /^Mjódd bus terminal → N1 Selfoss, / });
      await expect(mine).toBeVisible();
      await page.waitForTimeout(500);
      await page
        .getByTestId("card-with-corner")
        .filter({ visible: true })
        .first()
        .screenshot({ path: join(folder, "my-trips-card-phone.png") });
      return;
    }
    // The driver's trip page on a laptop: the icon between the name and Edit trip.
    await page.goto(`/drive/trips/${tripId}`);
    await expect(page.getByRole("button", { name: "Share this ride" })).toBeVisible();
    await page.waitForTimeout(500);
    const head = await page.getByTestId("page-head").filter({ visible: true }).boundingBox();
    if (head === null) throw new Error("The ride page has no head");
    await page.screenshot({
      path: join(folder, "trip-page-head-laptop.png"),
      clip: { x: head.x - 16, y: head.y - 16, width: head.width + 32, height: head.height + 26 },
    });
    // Its own screen on a laptop, in Icelandic: the post's text in it too.
    await page.goto(`/drive/trips/${tripId}/share`);
    await page.getByRole("button", { name: "Change the language to Icelandic" }).click();
    await expect(page.getByRole("heading", { name: "Deildu þessari ferð" })).toBeVisible();
    await expect(page.getByText(/^Býð far: /u)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Story á Instagram" })).toBeVisible();
    await expect(page.locator('[style*="blob:"]')).toBeVisible();
    await showWhole(page, 1280);
    await page.screenshot({ path: join(folder, "share-screen-laptop-is.png") });
  });
});
