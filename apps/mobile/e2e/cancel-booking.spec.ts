import { expect, test } from "@playwright/test";
import { confirmedBooking, secondPage, visible } from "./support/cancelling";
import { passengerRow } from "./support/driver-ride";
import { focused } from "./support/trips";

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
  // The ride is the seat's ticket, and the bar holds the button that
  // cancels over the one that keeps the booking, both in view (spec 31, 3.19).
  await expect(passenger.getByTestId("booking-ticket").filter(visible)).toBeVisible();
  const bar = passenger.getByTestId("bottom-bar").filter(visible);
  await expect(bar.getByRole("button", { name: "Cancel booking" })).toBeInViewport();
  await expect(bar.getByRole("button", { name: "Keep my booking" })).toBeInViewport();
  // With no reason chosen, why nothing was cancelled stands over the
  // button and takes focus.
  await bar.getByRole("button", { name: "Cancel booking" }).click();
  await expect(bar.getByRole("alert")).toHaveText("Choose a reason.");
  await expect(bar.getByRole("alert")).toBeInViewport();
  await expect.poll(() => focused(passenger)).toContain("Choose a reason.");

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
  // The refund is part of the outcome: a screen reader hears it with it.
  expect(await focused(passenger)).toMatch(/Full refund of [\d,]+ ISK, back to the card/);
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

  // On the ride, under Dóra's row once it is unfolded: Cancel booking
  // opens its own screen.
  await driver.reload();
  await passengerRow(driver, "Dóra", "Confirmed").click();
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
