import { expect, test } from "@playwright/test";
import { english, signUp } from "./support/account";
import { passengerRow } from "./support/driver-ride";
import { picturesUnderTheirText } from "./support/layout";
import { focused, postTripToSelfoss } from "./support/trips";

// Spec 5's request from both sides on the web build, in two browsers: a new
// driver posts Mjódd to N1 Selfoss for tomorrow, a passenger requests a
// seat with a message, the driver accepts it from My trips, the passenger
// pays on the test sheet, and both see the seat confirmed. Each project posts its own trip, so phone and desktop runs never
// meet. Screens left behind stay in the page, hidden, so text checks look
// only at what shows.

test.use({ locale: "en-GB" });

test("a passenger requests a seat, the driver accepts, the passenger pays", async ({
  page: driver,
  browser,
}, testInfo) => {
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

  // The driver posts the trip; the passenger opens it from its link.
  await signUp(driver, english, "Bára");
  const tripId = await postTripToSelfoss(driver, "18:30");
  await signUp(passenger, english, "Dóra");
  await passenger.goto(`/trips/${tripId}?from=0&to=1`);
  // The driver's picture stands with her name, over the lines about her (spec 31, 3.18).
  await expect(
    passenger.getByText("Reliability: not enough rides yet").filter(visible),
  ).toBeVisible();
  expect(await picturesUnderTheirText(passenger)).toEqual({ pictures: 1, under: [] });
  await passenger.getByRole("button", { name: "Send request", exact: true }).click();
  await passenger.getByLabel("Message to the driver (optional)").fill("A small rucksack.");
  await passenger.getByRole("button", { name: "Send request", exact: true }).click();
  await expect(passenger).toHaveURL(/\/bookings\/[0-9a-f-]+\/booked$/);
  await expect(passenger.getByRole("heading", { name: "Request sent" })).toBeVisible();
  await expect(
    passenger.getByText(/^Bára has until \d\d:\d\d( tomorrow)? to answer\.$/).filter(visible),
  ).toBeVisible();

  // My trips counts the request; the trip page shows who asks, and accepts.
  await driver.goto("/drive/trips");
  await driver.getByRole("button", { name: /, 1 request$/ }).click();
  await expect(driver).toHaveURL(`/drive/trips/${tripId}`);
  await expect(driver.getByRole("heading", { name: "Needs you" })).toBeVisible();
  await expect(
    driver.getByText("1 request needs your answer.", { exact: true }).filter(visible),
  ).toBeVisible();
  await expect(driver.getByText("Dóra", { exact: true }).filter(visible)).toBeVisible();
  await expect(driver.getByText("No reviews yet").filter(visible)).toBeVisible();
  await expect(driver.getByText("A small rucksack.").filter(visible)).toBeVisible();
  await expect(driver.getByText(/ left to answer$/).filter(visible)).toBeVisible();
  // And the picture of who asks stands with their name.
  expect(await picturesUnderTheirText(driver)).toEqual({ pictures: 1, under: [] });
  await driver.getByRole("button", { name: "Accept", exact: true }).click();
  const accepted = /^Request accepted\. Dóra has until \d\d:\d\d( tomorrow)? to pay\.$/;
  await expect(driver.getByText(accepted).filter(visible)).toBeVisible();
  await expect.poll(() => focused(driver)).toMatch(/^Request accepted\./);
  await expect(driver.getByRole("heading", { name: "Needs you" })).toBeHidden();
  await expect(driver.getByRole("heading", { name: "Passengers" })).toBeVisible();
  await expect(passengerRow(driver, "Dóra", "Waiting for payment")).toBeVisible();

  // The passenger sees the answer on coming back, and pays on the booking,
  // which opens in place of Request sent once it is no longer a request.
  await passenger.reload();
  await expect(passenger).toHaveURL(/\/bookings\/[0-9a-f-]+$/);
  await expect(
    passenger.getByRole("heading", { name: "Bára said yes: pay to keep your seat" }),
  ).toBeVisible();
  await expect(
    passenger.getByText(/^Your seat is held until \d\d:\d\d( tomorrow)?\.$/).filter(visible),
  ).toBeVisible();
  // Accepted: the account's email reaches the passenger on the web, so no
  // email is asked for (spec 7, 3.6.2; spec 26).
  const addEmail = passenger.getByText("Add an email so we can reach you if your ride changes.");
  await expect(addEmail).toHaveCount(0);
  await passenger.getByRole("button", { name: /^Pay [\d,]+ ISK$/ }).click();
  await expect(
    passenger.getByRole("heading", { name: "Test payment: no money moves" }),
  ).toBeVisible();
  await passenger.getByRole("button", { name: /^Pay [\d,]+ ISK$/ }).click();
  await expect(
    passenger.getByText("Your seat is confirmed", { exact: true }).filter(visible),
  ).toBeVisible();

  // The driver's trip shows the seat confirmed.
  await driver.reload();
  await expect(passengerRow(driver, "Dóra", "Confirmed")).toBeVisible();
  await passengerContext.close();
});
