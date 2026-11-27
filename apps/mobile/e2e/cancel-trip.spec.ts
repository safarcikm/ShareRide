import { expect, test } from "@playwright/test";
import { confirmedBooking, requestSeat, secondPage, visible } from "./support/cancelling";
import { passengerRow } from "./support/driver-ride";
import { focused } from "./support/trips";

// Spec 6, 3.3, on the web build: a driver posts Mjódd to N1 Selfoss for
// tomorrow, and three passengers are on it: Dóra has paid, Óli is accepted
// and has not paid yet, and Siggi's request waits. The driver cancels the
// trip with a reason and a note. Dóra gets a full refund, Óli's booking is
// cancelled with nothing to refund, Siggi's request is declined, and each
// reads why on their booking (rule M2, R6.6).

test.use({ locale: "en-GB" });

test("a driver cancels a trip with three passengers, who each read why", async ({
  page: driver,
  browser,
}, testInfo) => {
  // Four people sign up, the driver posts, accepts two and Dóra pays.
  test.slow();
  const [dora, oli, siggi] = await Promise.all([0, 1, 2].map(() => secondPage(browser, testInfo)));
  if (dora === undefined || oli === undefined || siggi === undefined) throw new Error("No pages");
  const { tripId, booking: paid } = await confirmedBooking(driver, dora.page);
  const unpaid = await requestSeat(oli.page, "Óli", tripId);
  await driver.reload();
  await driver.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(passengerRow(driver, "Óli", "Waiting for payment")).toBeVisible();
  const request = await requestSeat(siggi.page, "Siggi", tripId);

  // Cancel the ride, the last and red row of the ride's rows, opens its own screen.
  await driver.reload();
  await driver.getByRole("link", { name: "Cancel the ride", exact: true }).click();
  await expect(driver).toHaveURL(new RegExp(`/drive/trips/${tripId}/cancel$`));
  await expect(driver.getByRole("heading", { name: "Cancel your ride" })).toBeVisible();
  await expect(
    driver
      .getByText("1 passenger gets a full refund and will be told now.", { exact: true })
      .filter(visible),
  ).toBeVisible();
  await expect(
    driver
      .getByText("2 more people with a booking or request are told too.", { exact: true })
      .filter(visible),
  ).toBeVisible();
  // With no reason chosen nothing is cancelled: why stands over the red
  // button, in the bar and in view, and has the keyboard.
  const bar = driver.getByTestId("bottom-bar").filter(visible);
  await bar.getByRole("button", { name: "Cancel the ride", exact: true }).click();
  await expect(bar.getByRole("alert")).toHaveText("Choose a reason.");
  await expect(bar.getByRole("alert")).toBeInViewport();
  await expect.poll(() => focused(driver)).toContain("Choose a reason.");
  await expect(driver).toHaveURL(new RegExp(`/drive/trips/${tripId}/cancel$`));
  const counts = driver.getByText("This cancellation shows on your profile", { exact: true });
  await driver.getByRole("radio", { name: "Weather" }).click();
  await expect(counts.filter(visible)).toHaveCount(0);
  await driver.getByRole("radio", { name: "Car problem" }).click();
  await expect(counts.filter(visible)).toBeVisible();
  await driver.getByLabel("Note to passengers (optional)").fill("Sorry, the clutch went.");
  await driver.getByRole("button", { name: "Cancel the ride", exact: true }).click();

  // Back on the trip, it says so with focus, and offers nothing more.
  await expect(driver).toHaveURL(new RegExp(`/drive/trips/${tripId}\\?tripCancelled=1$`));
  const outcome = "You cancelled this ride: Car problem";
  await expect(driver.getByText(outcome, { exact: true }).filter(visible)).toBeVisible();
  await expect.poll(() => focused(driver)).toContain(outcome);
  await expect(
    driver.getByText("Your note: Sorry, the clutch went.", { exact: true }).filter(visible),
  ).toBeVisible();
  await expect(
    driver.getByRole("link", { name: "Cancel the ride", exact: true }).filter(visible),
  ).toHaveCount(0);
  await expect(driver.getByLabel(/^Dóra, /).filter(visible)).toHaveCount(0);

  // Each passenger reads why, with the note; only Dóra had paid.
  const said = "Bára cancelled the ride: Car problem";
  const refund = /^Full refund of [\d,]+ ISK, back to the card you paid with\.$/;
  for (const [person, booking] of [
    [dora, paid],
    [oli, unpaid],
    [siggi, request],
  ] as const) {
    await person.page.goto(booking);
    await expect(person.page.getByText(said, { exact: true }).filter(visible)).toBeVisible();
    await expect(
      person.page
        .getByText("Note from the driver: Sorry, the clutch went.", { exact: true })
        .filter(visible),
    ).toBeVisible();
    await expect(person.page.getByText(refund).filter(visible)).toHaveCount(
      person === dora ? 1 : 0,
    );
  }
  await Promise.all([dora, oli, siggi].map((person) => person.close()));
});
