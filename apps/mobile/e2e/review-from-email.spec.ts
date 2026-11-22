import { expect, test, type Page } from "@playwright/test";
import { apiUrl } from "../playwright.config";
import { english, enterCode } from "./support/account";
import { confirmedBooking, secondPage, visible } from "./support/cancelling";
import { confirmEmail, emailTo, linkIn } from "./support/email";

// "How was your trip?" by email on the web build (spec 20, 3.1 to 3.3).
// Bára posts Mjódd to N1 Selfoss and Dóra books and pays; Dóra gave an
// email at sign-up, as the web asks (a browser gets no push), and opens its
// link. The test API then moves the trip a day and a half back, so it
// completes and the email goes. Dóra opens its link in another browser
// where she is not signed in, such as her phone's: the app asks her to sign
// in and then opens the rating screen.

test.use({ locale: "en-GB" });

/** Puts the trip's first stop `minutes` from now, as in the trip day journeys. */
async function move(page: Page, tripId: string, minutes: number) {
  const moved = await page.request.post(`${apiUrl}/e2e/trips/${tripId}/move`, {
    data: { minutes },
  });
  expect(moved.status()).toBe(204);
}

test("the passenger rates the driver from the email, signing in on the way", async ({
  page: driver,
  browser,
}, testInfo) => {
  test.slow();
  const { page: passenger, close } = await secondPage(browser, testInfo);
  const { tripId, booking, passengerPhone, passengerEmail } = await confirmedBooking(
    driver,
    passenger,
  );
  await confirmEmail(passenger, passengerEmail);
  await move(driver, tripId, -36 * 60);

  // The email opens the rating screen of her booking.
  const asked = await emailTo(passengerEmail, /^How was your trip\?$/);
  expect(asked.text).toContain("Rate the driver: Bára.");
  const link = linkIn(asked, "Open in ShareRide");
  expect(link).toBe(`${booking}/rate`);

  // In a browser that is not signed in, the link asks her to sign in first.
  const { page: phone, close: closePhone } = await secondPage(browser, testInfo);
  await phone.goto(link);
  await expect(
    phone.getByRole("heading", { name: "Sign in or create an account" }).filter(visible),
  ).toBeVisible();
  await enterCode(phone, english, passengerPhone);

  // Signed in, she lands on the rating screen and sends her review.
  await expect(phone).toHaveURL(`${booking}/rate`);
  await phone.getByRole("radio", { name: "5 stars" }).click();
  await phone.getByRole("button", { name: "Send review" }).click();
  await expect(
    phone.getByText("Review sent. Thank you.", { exact: true }).filter(visible),
  ).toBeVisible();
  await closePhone();
  await close();
});
