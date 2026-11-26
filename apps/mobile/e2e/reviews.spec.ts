import { expect, test, type Page } from "@playwright/test";
import { apiUrl } from "../playwright.config";
import { confirmedBooking, secondPage, visible } from "./support/cancelling";

// Spec 8's ratings and reviews on the web build. As in the trip day
// journeys, Bára posts Mjódd to N1 Selfoss and Dóra books and pays; then the
// test API moves that one trip a day and a half back, so it has completed.
// Dóra rates Bára, and her review waits; Bára rates Dóra, and both show at
// once (R8.9). Then Dóra opens Bára's profile from the trip. The window,
// the limits and the errors are left to the API and screen tests.

test.use({ locale: "en-GB" });

/** Puts the trip's first stop `minutes` from now, as in the trip day journeys. */
async function move(page: Page, tripId: string, minutes: number) {
  const moved = await page.request.post(`${apiUrl}/e2e/trips/${tripId}/move`, {
    data: { minutes },
  });
  expect(moved.status()).toBe(204);
}

const text = (page: Page, said: string) => page.getByText(said, { exact: true }).filter(visible);

test("after the trip, both review the other, and then each sees the other's review", async ({
  page: driver,
  browser,
}, testInfo) => {
  test.slow();
  const { page: passenger, close } = await secondPage(browser, testInfo);
  const { tripId, booking } = await confirmedBooking(driver, passenger);
  await move(driver, tripId, -36 * 60);

  // Dóra rates Bára, with a few words; it waits for Bára's.
  await passenger.goto(booking);
  await passenger.getByRole("link", { name: "Rate the driver" }).click();
  await passenger.getByRole("radio", { name: "5 stars" }).click();
  await passenger
    .getByLabel("Tell others what it was like (optional)")
    .fill("Lovely drive, right on time.");
  await passenger.getByRole("button", { name: "Send review" }).click();
  await expect(text(passenger, "Review sent. Thank you.")).toBeVisible();
  await expect(
    text(
      passenger,
      "Your review appears when the other person has reviewed too, or after 14 days.",
    ),
  ).toBeVisible();

  // Bára rates Dóra from her trip: now both show.
  await driver.goto(`/drive/trips/${tripId}`);
  await driver.getByRole("button", { name: "Rate your passenger: Dóra" }).click();
  await driver.getByRole("radio", { name: "4 stars" }).click();
  await driver.getByRole("button", { name: "Send review" }).click();
  await expect(text(driver, "You have both reviewed, so both reviews show now.")).toBeVisible();
  await driver.getByRole("button", { name: "Back to the ride" }).click();
  await expect(text(driver, "Review of you")).toBeVisible();
  await expect(text(driver, "Lovely drive, right on time.")).toBeVisible();
  await expect(driver.getByLabel("5 stars out of 5").filter(visible)).toBeVisible();

  // And Dóra sees Bára's review of her.
  await passenger.goto(booking);
  await expect(text(passenger, "Review of you")).toBeVisible();
  await expect(passenger.getByLabel("4 stars out of 5").filter(visible)).toBeVisible();

  // Dóra opens Bára's profile from the trip's page: her review shows there,
  // in the rating, and the trip counts on Bára's reliability (spec 8, screen 7).
  await passenger.goto(`/trips/${tripId}`);
  await passenger.getByRole("link", { name: "See profile: Bára" }).filter(visible).click();
  await expect(passenger.getByRole("heading", { name: "Bára" }).filter(visible)).toBeVisible();
  await expect(text(passenger, "5.0 (1 rating)")).toBeVisible();
  await expect(text(passenger, "Lovely drive, right on time.")).toBeVisible();
  await passenger
    .getByRole("button", { name: "Reliability: not enough rides yet" })
    .filter(visible)
    .click();
  await expect(text(passenger, "As a driver: kept 1 of 1")).toBeVisible();
  await close();
});
