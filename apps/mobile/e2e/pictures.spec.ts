import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

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
    await page.getByRole("button", { name: "Search", exact: true }).click();
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
});
