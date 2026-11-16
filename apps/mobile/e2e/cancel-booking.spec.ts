import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { english, signUp } from "./support/account";
import { focused, postTripToSelfoss } from "./support/trips";

// Spec 6's cancelling of one booking, on the web build: a driver posts
// Mjódd to N1 Selfoss for tomorrow, less than 24 hours from now, a
// passenger requests a seat, the driver accepts and the passenger pays.
// Then the passenger cancels: a full refund, since boarding is more than 15
// minutes away, and a cancellation that shows on their profile, since it is
// less than 24 hours away, unless for the weather (rule M2, R6.8). Or the
// driver cancels, with a note the passenger reads (3.4). The last 15
// minutes, with no refund, are left to the API and screen tests: the test
// API's clock is the real one. Each test posts its own trip, so phone and
// desktop runs never meet.

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

const visible = { visible: true } as const;

/** A second person's page, the same size as the test's own. */
async function secondPage(browser: Browser, testInfo: TestInfo) {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL } =
    testInfo.project.use;
  const context = await browser.newContext({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    baseURL,
    locale: "en-GB",
  });
  return { page: await context.newPage(), close: () => context.close() };
}

/**
 * Bára posts a trip for tomorrow, Dóra requests a seat, Bára accepts and
 * Dóra pays, as in the request journey. Gives the trip and the booking's
 * address.
 */
async function confirmedBooking(driver: Page, passenger: Page) {
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
  return { tripId, booking };
}

test("a passenger cancels a paid booking the day before, with a full refund", async ({
  page: driver,
  browser,
}, testInfo) => {
  // Two people sign up, the driver posts, accepts, and the passenger pays.
  test.slow();
  const { page: passenger, close } = await secondPage(browser, testInfo);
  const { booking } = await confirmedBooking(driver, passenger);

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
  await close();
});

test("a driver cancels a paid booking with a note the passenger reads", async ({
  page: driver,
  browser,
}, testInfo) => {
  test.slow();
  const { page: passenger, close } = await secondPage(browser, testInfo);
  const { tripId, booking } = await confirmedBooking(driver, passenger);

  // On the trip, under Dóra: Cancel booking opens its own screen.
  await driver.reload();
  await driver.getByRole("button", { name: "Cancel booking: Dóra" }).click();
  await expect(driver).toHaveURL(/\/bookings\/[0-9a-f-]+\/cancel$/);
  await expect(driver.getByRole("heading", { name: "Cancel booking: Dóra" })).toBeVisible();
  await expect(
    driver.getByText(/^Dóra gets a full refund of [\d,]+ ISK$/).filter(visible),
  ).toBeVisible();
  await driver.getByRole("radio", { name: "Car problem" }).click();
  await expect(
    driver.getByText("This cancellation shows on your profile").filter(visible),
  ).toBeVisible();
  await driver.getByLabel("Note to the passenger (optional)").fill("Sorry, the clutch went.");
  await driver.getByRole("button", { name: "Cancel booking", exact: true }).click();

  // Back on the trip, the outcome takes focus, and Dóra has gone.
  await expect(driver).toHaveURL(new RegExp(`/drive/trips/${tripId}\\?cancelled=`));
  const outcome = "Booking cancelled. The passenger has been told.";
  await expect(driver.getByText(outcome, { exact: true }).filter(visible)).toBeVisible();
  await expect.poll(() => focused(driver)).toContain(outcome);
  await expect(driver.getByLabel(/^Dóra, /)).toBeHidden();

  // Dóra reads why, with the note and the refund.
  await passenger.goto(booking);
  await expect(
    passenger
      .getByText("Bára cancelled this booking: Car problem", { exact: true })
      .filter(visible),
  ).toBeVisible();
  await expect(
    passenger
      .getByText("Note from the driver: Sorry, the clutch went.", { exact: true })
      .filter(visible),
  ).toBeVisible();
  await expect(
    passenger
      .getByText(/^Full refund of [\d,]+ ISK, back to the card you paid with\.$/)
      .filter(visible),
  ).toBeVisible();
  await close();
});
