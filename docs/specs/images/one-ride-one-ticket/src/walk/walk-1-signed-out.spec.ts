import { test } from "@playwright/test";
import { shot } from "./walk";

test.use({ locale: "en-GB" });

test("signed out tour", async ({ page }, info) => {
  const s = (name: string, whole = false) => shot(page, info, "1-signed-out", name, whole);
  await page.goto("/");
  await page.getByRole("heading", { name: "Share your ride" }).waitFor();
  await s("front");
  await s("front-whole", true);

  await page.goto("/search");
  await s("search");
  await page.getByRole("button", { name: /^From: / }).click();
  await s("search-from-open");
  await page.getByLabel("From", { exact: true }).fill("selfo");
  await s("search-from-typed");
  await page.getByRole("button", { name: /^N1 Selfoss,/ }).click();
  await page.getByRole("button", { name: /^To: / }).click();
  await page.getByLabel("To", { exact: true }).fill("vík");
  await page.getByRole("button", { name: /^N1 Vík,/ }).click();
  await s("search-filled");
  await page
    .getByRole("button", { name: /^Date/ })
    .first()
    .click()
    .catch(() => {});
  await s("search-date-open");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByTestId("results-heading").waitFor();
  await s("results");
  await s("results-whole", true);
  await page
    .getByRole("button", { name: /^Leaves N1 Selfoss at/ })
    .first()
    .click();
  await page.waitForURL(/\/trips\//);
  await s("trip");
  await s("trip-whole", true);
  await page
    .getByRole("button", { name: "Book", exact: true })
    .click()
    .catch(() => {});
  await s("book-signed-out");
  await s("book-signed-out-whole", true);

  for (const path of [
    "/my-rides",
    "/offer",
    "/messages",
    "/profile",
    "/sign-in",
    "/meeting-points",
    "/about",
    "/carpool-iceland",
    "/legal",
    "/rides",
    "/settings",
  ]) {
    await page.goto(path);
    await page.waitForTimeout(800);
    await s(path.slice(1));
    if (["/about", "/carpool-iceland", "/meeting-points", "/rides"].includes(path))
      await s(`${path.slice(1)}-whole`, true);
  }
});
