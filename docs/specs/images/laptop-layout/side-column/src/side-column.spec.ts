import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { english, signUp } from "./support/account";
import { postTripToSelfoss } from "./support/trips";

// Pictures of the side column beside Find, with "Your next ride" in it
// (README.md): on a laptop, close up and whole, and Find on a phone. A
// Chrome that draws its scrollbars, as Chrome on Windows does, shows the
// one under the side column, where there was one.
const env = process.env as Readonly<Record<string, string | undefined>>;
const out = env["PICTURES_OUT"] ?? "/tmp/side-column";
/** "before" or "after", the start of each picture's name. */
const stage = env["STAGE"] ?? "after";

test.use({
  locale: "en-GB",
  deviceScaleFactor: 2,
  launchOptions: {
    executablePath: env["PLAYWRIGHT_CHROMIUM_PATH"],
    ignoreDefaultArgs: ["--hide-scrollbars"],
  },
});

/** Bára drives from Mjódd to Selfoss tomorrow at 08:05, and opens Find. */
async function withNextRide(page: Page) {
  await signUp(page, english, "Bára");
  await postTripToSelfoss(page, "08:05");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your next ride" })).toBeVisible();
}

test("the side column beside Find, on a laptop", async ({ page }) => {
  test.setTimeout(120_000);
  mkdirSync(out, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 1000 });
  await withNextRide(page);
  await expect(page.getByTestId("iceland-map").filter({ visible: true })).toBeVisible();
  // Nothing under the pointer: the first ride's card would show its edge.
  await page.mouse.move(0, 0);
  const side = page.getByTestId("columns-side").filter({ visible: true });
  const column = await side.boundingBox();
  if (column === null) throw new Error("No side column");
  const room = 32;
  await page.screenshot({
    path: join(out, `${stage}-1-close-up.png`),
    clip: {
      x: column.x - room,
      y: column.y - room,
      width: column.width + 2 * room,
      height: column.height + 2 * room,
    },
  });
  await page.screenshot({ path: join(out, `${stage}-2-laptop.png`) });
});

test("Find with the next ride, on a phone", async ({ browser }) => {
  test.setTimeout(120_000);
  mkdirSync(out, { recursive: true });
  // A phone's screen; the side column stands under the rides there.
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "en-GB",
    baseURL: "http://localhost:8082",
  });
  const page = await context.newPage();
  await withNextRide(page);
  await page.screenshot({ path: join(out, `${stage}-3-phone.png`) });
  await context.close();
});
