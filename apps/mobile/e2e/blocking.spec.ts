import { expect, test } from "@playwright/test";
import { english, signUp } from "./support/account";
import { postTripToSelfoss } from "./support/trips";

// Spec 9's blocking on the web build, in two browsers: a passenger with a
// confirmed booking blocks the driver from their chat, is offered to cancel
// it, keeps it, and the chat becomes read-only for both. The driver's next trip is then
// gone for the passenger, as if it did not exist, until the passenger
// unblocks the driver in Settings. Each project posts its own trips, so
// phone and desktop runs never meet.

test.use({ locale: "en-GB" });

test("a passenger blocks a driver, loses their trips, and unblocks them", async ({
  page: driver,
  browser,
}, testInfo) => {
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
  const closed = "This chat is closed. You can still read it.";

  // A confirmed booking, as in the chat journey.
  await signUp(driver, english, "Bára");
  const tripId = await postTripToSelfoss(driver, "17:30");
  await signUp(passenger, english, "Dóra");
  await passenger.goto(`/trips/${tripId}?from=0&to=1`);
  await passenger.getByRole("button", { name: "Send request", exact: true }).click();
  await expect(passenger.getByRole("heading", { name: "Request this ride" })).toBeVisible();
  await passenger.getByRole("button", { name: "Send request", exact: true }).click();
  await expect(passenger).toHaveURL(/\/bookings\/[0-9a-f-]+\/booked$/);
  await driver.goto(`/drive/trips/${tripId}`);
  await driver.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(driver.getByLabel("Dóra, 1 seat, Waiting for payment")).toBeVisible();
  await passenger.reload();
  await passenger.getByRole("button", { name: /^Pay [\d,]+ ISK$/ }).click();
  await passenger.getByRole("button", { name: /^Pay [\d,]+ ISK$/ }).click();
  await expect(
    passenger.getByText("Your seat is confirmed", { exact: true }).filter(visible),
  ).toBeVisible();
  const laterTrip = await postTripToSelfoss(driver, "19:30", [], true);

  // Blocking asks first, then offers the usual way out of the booking they
  // share; the passenger keeps it and goes back to the conversation.
  await passenger.getByRole("button", { name: "Message Bára" }).click();
  await expect(passenger).toHaveURL(/\/messages\/[0-9a-f-]+$/);
  const chat = passenger.url();
  await passenger.getByRole("button", { name: "Block Bára" }).click();
  await expect(passenger.getByRole("heading", { name: "Block Bára?" })).toBeVisible();
  await passenger.getByRole("button", { name: "Block Bára" }).click();
  await expect(passenger.getByRole("heading", { name: "Bára is blocked." })).toBeVisible();
  await expect(
    passenger
      .getByText("You still have a booking together. You can cancel it under the usual rules.")
      .filter(visible),
  ).toBeVisible();
  await expect(
    passenger.getByRole("button", { name: /^Cancel booking, / }).filter(visible),
  ).toBeVisible();
  await passenger.getByRole("button", { name: "Back to the conversation" }).click();
  await expect(passenger).toHaveURL(chat);
  await expect(passenger.getByText(closed).filter(visible)).toBeVisible();
  await expect(
    passenger
      .getByText("You blocked Bára. You can unblock them in Settings, under Safety.")
      .filter(visible),
  ).toBeVisible();
  await expect(passenger.getByLabel("Write a message")).toBeHidden();

  // The driver's side is read-only too, and says nothing of a block.
  await driver.goto(chat.replace(/^.*\/messages\//, "/messages/"));
  await expect(driver.getByText(closed).filter(visible)).toBeVisible();
  await expect(driver.getByText(/blocked/)).toHaveCount(0);

  // The driver's other trip is gone for the passenger, as if it did not exist.
  await passenger.goto(`/trips/${laterTrip}?from=0&to=1`);
  await expect(
    passenger
      .getByText("This ride can't be found. The link may be wrong, or the ride removed.")
      .filter(visible),
  ).toBeVisible();

  // Unblocked in Settings, it is back.
  await passenger.goto("/settings");
  await passenger.getByRole("button", { name: "Blocked people" }).click();
  await expect(passenger.getByText("Bára", { exact: true }).filter(visible)).toBeVisible();
  await passenger.getByRole("button", { name: "Unblock Bára" }).click();
  await expect(passenger.getByText("Bára is unblocked.").filter(visible)).toBeVisible();
  await expect(passenger.getByText("You haven't blocked anyone.").filter(visible)).toBeVisible();
  await passenger.goto(`/trips/${laterTrip}?from=0&to=1`);
  await expect(
    passenger.getByRole("button", { name: "Send request", exact: true }).filter(visible),
  ).toBeVisible();

  await passengerContext.close();
});
