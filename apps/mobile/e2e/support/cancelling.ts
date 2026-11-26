import { expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { english, signUp } from "./account";
import { passengerRow } from "./driver-ride";
import { postTripToSelfoss } from "./trips";

// People and bookings for the cancelling journeys (spec 6): a trip for
// tomorrow, less than 24 hours away, and the people booked on it, each in
// their own browser.

/**
 * A departure tomorrow earlier in the day than now, so it is less than 24
 * hours away: an hour before now, on a quarter hour (Iceland is UTC all
 * year), or midnight just after midnight.
 */
export function withinADay(): string {
  const now = new Date();
  const minutes = Math.max(0, now.getUTCHours() * 60 + now.getUTCMinutes() - 60);
  const rounded = minutes - (minutes % 15);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(rounded / 60))}:${pad(rounded % 60)}`;
}

/** Only what shows: a screen behind another stays in the page. */
export const visible = { visible: true } as const;

/** A second person's page, the same size as the test's own. */
export async function secondPage(browser: Browser, testInfo: TestInfo) {
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
 * Bára posts a trip for tomorrow, without the suggested stops named in
 * `skip`, Dóra requests a seat to the stop numbered `to`, Bára accepts and
 * Dóra pays, as in the request journey. Gives the trip, the booking's
 * address, and Dóra's number and the email she gave at sign-up.
 */
export async function confirmedBooking(
  driver: Page,
  passenger: Page,
  skip: readonly string[] = [],
  to = 1,
) {
  await signUp(driver, english, "Bára");
  const tripId = await postTripToSelfoss(driver, withinADay(), skip);
  const { phone, email } = await signUp(passenger, english, "Dóra");
  await askForSeat(passenger, tripId, to);
  await driver.goto(`/drive/trips/${tripId}`);
  await driver.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(passengerRow(driver, "Dóra", "Waiting for payment")).toBeVisible();
  await passenger.reload();
  await expect(passenger).toHaveURL(/\/bookings\/[0-9a-f-]+$/);
  const booking = passenger.url();
  await passenger.getByRole("button", { name: /^Pay [\d,]+ ISK$/ }).click();
  await passenger.getByRole("button", { name: /^Pay [\d,]+ ISK$/ }).click();
  await expect(
    passenger.getByText("Your seat is confirmed", { exact: true }).filter(visible),
  ).toBeVisible();
  return { tripId, booking, passengerPhone: phone, passengerEmail: email };
}

/**
 * A new passenger asks for a seat from the first stop to the second, with
 * a message. Gives the booking's address.
 */
export async function requestSeat(page: Page, firstName: string, tripId: string) {
  await signUp(page, english, firstName);
  return askForSeat(page, tripId);
}

/** Someone signed in asks for a seat as `requestSeat` does, or as far as the stop numbered `to`. */
export async function askForSeat(page: Page, tripId: string, to = 1) {
  await page.goto(`/trips/${tripId}?from=0&to=${to}`);
  await page.getByRole("button", { name: "Send request", exact: true }).click();
  await page.getByLabel("Message to the driver (optional)").fill("One small bag.");
  await page.getByRole("button", { name: "Send request", exact: true }).click();
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]+\/booked$/);
  return page.url().replace(/\/booked$/, "");
}
