import { expect, test } from "@playwright/test";
import { english, signUp } from "./support/account";
import { focused, postTripToSelfoss } from "./support/trips";

// Spec 6's passenger cancelling, on the web build: a driver posts Mjódd to
// N1 Selfoss for tomorrow, less than 24 hours from now, a passenger
// requests a seat, the driver accepts and the passenger pays. Then the
// passenger cancels: a full refund, since boarding is more than 15 minutes
// away, and a cancellation that shows on their profile, since it is less
// than 24 hours away, unless for the weather (rule M2, R6.8). The last 15
// minutes, with no refund, are left to the API and screen tests: the test
// API's clock is the real one. Each project posts its own trip, so phone
// and desktop runs never meet.

test.use({ locale: "en-GB" });

/**
 * A departure tomorrow earlier in the day than now, so it is less than 24
 * hours away: an hour before now, on a quarter hour (Iceland is UTC all
 * year), or midnight just after midnight.
 */
function withinADay(): string {
  const now = new Date();
  const minutes = Math.max(0, now.getUTCHours() * 60 + now.getUTCMinutes() - 60);
  const rounded = minutes - (minutes % 15);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(rounded / 60))}:${pad(rounded % 60)}`;
}

test("a passenger cancels a paid booking the day before, with a full refund", async ({
  page: driver,
  browser,
}, testInfo) => {
  // Two people sign up, the driver posts, accepts, and the passenger pays.
  test.slow();
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL } =
    testInfo.project.use;
  const passengerContext = await browser.newContext({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    baseURL,
    locale: "en-GB",
  });
  const passenger = await passengerContext.newPage();
  const visible = { visible: true } as const;

  // A confirmed booking, as in the request journey.
  await signUp(driver, english, "Bára");
  const tripId = await postTripToSelfoss(driver, withinADay());
  await signUp(passenger, english, "Dóra");
  await passenger.goto(`/trips/${tripId}?from=0&to=1`);
  await passenger.getByRole("button", { name: "Send request", exact: true }).click();
  await passenger.getByLabel("Message to the driver (optional)").fill("One small bag.");
  await passenger.getByRole("button", { name: "Send request", exact: true }).click();
  await expect(passenger).toHaveURL(/\/bookings\/[0-9a-f-]+\/booked$/);
  await driver.goto(`/drive/trips/${tripId}`);
  await driver.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(driver.getByLabel("Dóra, 1 seat, Waiting for payment")).toBeVisible();
  await passenger.reload();
  await expect(passenger).toHaveURL(/\/bookings\/[0-9a-f-]+$/);
  const booking = passenger.url();
  await passenger.getByRole("button", { name: /^Pay [\d,]+ ISK$/ }).click();
  await passenger.getByRole("button", { name: /^Pay [\d,]+ ISK$/ }).click();
  await expect(
    passenger.getByText("Your seat is confirmed", { exact: true }).filter(visible),
  ).toBeVisible();

  // Cancel booking opens its own screen, with the refund first.
  await passenger.getByRole("button", { name: "Cancel booking" }).click();
  await expect(passenger).toHaveURL(`${booking}/cancel`);
  await expect(passenger.getByRole("heading", { name: "Cancel your booking" })).toBeVisible();
  await expect(passenger.getByText(/^Full refund of [\d,]+ ISK$/).filter(visible)).toBeVisible();
  const counts = passenger.getByText("This cancellation shows on your profile");

  // The weather never counts; changed plans do, in the last 24 hours.
  await passenger.getByRole("radio", { name: "Weather" }).click();
  await expect(counts.filter(visible)).toHaveCount(0);
  await passenger.getByRole("radio", { name: "Plans changed" }).click();
  await expect(counts.filter(visible)).toBeVisible();
  await expect(
    passenger
      .getByText("Bára is told, and the seat is freed for others.", { exact: true })
      .filter(visible),
  ).toBeVisible();
  await passenger.getByRole("button", { name: "Cancel booking" }).click();

  // Back on the booking, the outcome takes focus.
  await expect(passenger).toHaveURL(`${booking}?cancelled=1`);
  const outcome = "You cancelled this booking: Plans changed";
  await expect(passenger.getByText(outcome, { exact: true }).filter(visible)).toBeVisible();
  await expect.poll(() => focused(passenger)).toContain(outcome);
  await expect(
    passenger
      .getByText(/^Full refund of [\d,]+ ISK, back to the card you paid with\.$/)
      .filter(visible),
  ).toBeVisible();
  await expect(counts.filter(visible)).toBeVisible();
  await expect(passenger.getByRole("button", { name: "Cancel booking" })).toBeHidden();

  // The driver no longer has Dóra on the trip.
  await driver.reload();
  await expect(driver.getByRole("heading", { name: "Passengers" })).toBeHidden();
  await expect(driver.getByLabel(/^Dóra, /)).toBeHidden();
  await passengerContext.close();
});
