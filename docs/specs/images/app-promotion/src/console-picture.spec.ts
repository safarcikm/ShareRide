// Takes picture 7 of spec 35, section 5: the console's Phone apps switches.
// It runs as one of the console's journeys, which start a test API with a
// new operator: copy it into apps/admin/e2e/, then from apps/admin, with
// TEST_DATABASE_URL set (it empties that database):
//   npx playwright test e2e/console-picture.spec.ts --trace off
// and delete the copy again.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { operatorLink } from "../playwright.config.ts";
import { addAuthenticator } from "./passkeys.ts";

const picture = new URL(
  "../../../docs/specs/images/app-promotion/7-console-phone-apps.png",
  import.meta.url,
);

test("the console's Phone apps switches, for spec 35", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await addAuthenticator(page);
  await page.goto(readFileSync(operatorLink, "utf8").trim());
  await page.getByLabel("Name of this passkey").fill("Laptop");
  await page.getByRole("button", { name: "Save the passkey" }).click();
  await expect(page.getByRole("heading", { name: "Welcome, Operator" })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Console menu" })
    .getByRole("link", { name: "Settings" })
    .click();
  await page
    .getByRole("heading", { name: "Phone apps" })
    .evaluate((heading) => heading.scrollIntoView({ block: "start" }));
  await page.mouse.wheel(0, -24);
  await page.waitForTimeout(500);
  await page.screenshot({ path: picture.pathname });
  await context.close();
});
