import { expect, test } from "@playwright/test";
import { english, signUp } from "./support/account";
import { visible } from "./support/cancelling";
import { chooseTime, postTripToSelfoss, tomorrow } from "./support/trips";

// Spec 6, 3.6, on the web build: Bára posts Mjódd to N1 Selfoss for
// tomorrow morning, then posts the return from the trip page. The builder
// opens at the date and times with the stops the other way, keeping her
// price and seats, and she publishes it for the evening.

test.use({ locale: "en-GB" });

test("a driver posts the return of a trip from its page", async ({ page }) => {
  test.slow();
  await signUp(page, english, "Bára");
  const tripId = await postTripToSelfoss(page, "08:00");

  await page.goto(`/drive/trips/${tripId}`);
  await page.getByRole("button", { name: "Post the way back" }).click();
  await expect(page.getByRole("heading", { name: "When are you leaving?" })).toBeVisible();
  const [, returnId] = /\/drive\/trips\/([0-9a-f-]+)\/time/.exec(page.url()) ?? [];
  expect(returnId).toBeDefined();
  expect(returnId).not.toEqual(tripId);

  const day = tomorrow("en");
  if (day.nextMonth) await page.getByRole("button", { name: "Next month" }).click();
  await page.getByRole("radio", { name: day.name }).click();
  await chooseTime(page, "Leaving N1 Selfoss at", "18:00");
  await page.getByRole("button", { name: "Choose seats" }).click();
  await page.getByRole("button", { name: "Set your price" }).click();
  await page.getByRole("button", { name: "Check your ride" }).click();
  await page.getByRole("button", { name: "Publish ride" }).click();
  await expect(page.getByRole("heading", { name: "Your ride is published" })).toBeVisible();

  // The way back ends where the first one began.
  await page.goto(`/drive/trips/${returnId ?? ""}`);
  await expect(
    page.getByRole("heading", { name: "Your ride to Mjódd bus terminal" }).filter(visible),
  ).toBeVisible();
  // The trip it came from is as it was.
  await page.goto(`/drive/trips/${tripId}`);
  await expect(
    page.getByRole("heading", { name: "Your ride to N1 Selfoss" }).filter(visible),
  ).toBeVisible();
});
