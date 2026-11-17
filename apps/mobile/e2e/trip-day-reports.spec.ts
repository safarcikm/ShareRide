import { expect, test, type Page } from "@playwright/test";
import { apiUrl } from "../playwright.config";
import { confirmedBooking, secondPage, visible } from "./support/cancelling";

// Spec 8's reports on the web build. As in the trip day journey, Bára posts
// Mjódd to N1 Selfoss and Dóra books and pays; then the test API moves that
// one trip so it left Mjódd 15 minutes ago, past the 10-minute wait. One
// side reports, the other is asked and doesn't answer, and the test API
// moves the trip a day and a half back: the 24 hours to answer have passed
// and the report stands, as the minute job lets it. Contested reports and
// ShareRide's decisions are left to the API and screen tests.

test.use({ locale: "en-GB" });

/** Puts the trip's first stop `minutes` from now, as in the trip day journey. */
async function move(page: Page, tripId: string, minutes: number) {
  const moved = await page.request.post(`${apiUrl}/e2e/trips/${tripId}/move`, {
    data: { minutes },
  });
  expect(moved.status()).toBe(204);
}

const text = (page: Page, said: string | RegExp) =>
  page.getByText(said, { exact: typeof said === "string" }).filter(visible);

test("a no-show nobody contests stands, with no refund", async ({
  page: driver,
  browser,
}, testInfo) => {
  test.slow();
  const { page: passenger, close } = await secondPage(browser, testInfo);
  const { tripId, booking } = await confirmedBooking(driver, passenger);
  await move(driver, tripId, -15);

  // Bára says she is at Mjódd, then marks Dóra as a no-show, with a note.
  await driver.goto(`/drive/trips/${tripId}`);
  await driver.getByRole("button", { name: "I'm here at Mjódd bus terminal" }).click();
  await expect(text(driver, "We've told your passengers you're here.")).toBeVisible();
  await driver.getByRole("button", { name: "Mark Dóra as a no-show" }).click();
  await expect(
    text(
      driver,
      "Mark this passenger as a no-show? They get no refund, and it shows on their profile.",
    ),
  ).toBeVisible();
  await driver.getByLabel("Note for ShareRide (optional)").fill("Waited 15 minutes.");
  await driver.getByRole("button", { name: "Mark as no-show", exact: true }).click();
  await expect(
    text(driver, /^You marked Dóra as a no-show\. Dóra can answer until /),
  ).toBeVisible();

  // Dóra is asked whether it's right, and doesn't answer.
  await passenger.goto(booking);
  await expect(text(passenger, "Bára says you didn't come.")).toBeVisible();
  await expect(passenger.getByRole("button", { name: "That's not right" })).toBeVisible();

  await move(driver, tripId, -36 * 60);
  await passenger.reload();
  await expect(
    text(passenger, "Marked as a no-show: no refund, and it shows on your profile."),
  ).toBeVisible();
  await expect(passenger.getByRole("button", { name: "That's not right" })).toHaveCount(0);
  await close();
});

test("the driver didn't come and didn't answer: the booking is cancelled with a full refund", async ({
  page: driver,
  browser,
}, testInfo) => {
  test.slow();
  const { page: passenger, close } = await secondPage(browser, testInfo);
  const { tripId, booking } = await confirmedBooking(driver, passenger);
  await move(driver, tripId, -15);

  // Dóra waited at Mjódd and tells ShareRide that Bára didn't come.
  await passenger.goto(booking);
  await passenger.getByRole("button", { name: "The driver didn't come" }).click();
  await expect(text(passenger, "Tell ShareRide that Bára didn't come?")).toBeVisible();
  await passenger.getByRole("button", { name: "Tell ShareRide", exact: true }).click();
  await expect(
    text(passenger, /^You told ShareRide Bára didn't come\. Bára can answer until /),
  ).toBeVisible();

  // Bára is asked on her trip, and doesn't answer.
  await driver.goto(`/drive/trips/${tripId}`);
  await expect(text(driver, "Dóra says you didn't come.")).toBeVisible();

  await move(driver, tripId, -36 * 60);
  await passenger.reload();
  await expect(
    text(passenger, "Bára didn't come, so ShareRide cancelled this booking."),
  ).toBeVisible();
  await expect(
    text(passenger, /^Full refund of [\d,]+ ISK, back to the card you paid with\.$/),
  ).toBeVisible();
  await close();
});
