import { expect, test } from "@playwright/test";
import { confirmedBooking, secondPage, visible } from "./support/cancelling";
import { chooseTime, focused, timeField } from "./support/trips";

// Spec 6, 3.2, on the web build: a driver posts Mjódd to N1 Selfoss for
// tomorrow and Dóra pays for a seat. The driver moves the departure 45
// minutes later: the check says Dóra is told and may cancel with a full
// refund (R6.3). Dóra reads the change on her booking and cancels with a
// full refund, "The trip changed" chosen, without it counting.

test.use({ locale: "en-GB" });

/** A clock time ("09:00") `minutes` later. */
function later(time: string, minutes: number): string {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const total = (hour * 60 + minute + minutes) % (24 * 60);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

test("a driver moves the departure 45 minutes, and the passenger cancels with a full refund", async ({
  page: driver,
  browser,
}, testInfo) => {
  test.slow();
  const { page: dora, close } = await secondPage(browser, testInfo);
  const { tripId, booking } = await confirmedBooking(driver, dora);

  // Edit trip opens the trip's parts; the time opens its own screen.
  await driver.goto(`/drive/trips/${tripId}`);
  await driver.getByRole("button", { name: "Edit trip", exact: true }).click();
  await expect(driver).toHaveURL(new RegExp(`/drive/trips/${tripId}/edit$`));
  await expect(driver.getByRole("heading", { name: "Edit trip" })).toBeVisible();
  await driver.getByRole("link", { name: "Change the time" }).click();
  await expect(driver.getByRole("heading", { name: "Change the departure" })).toBeVisible();
  await expect(
    driver
      .getByText(
        "With bookings, the departure can move by up to 2 hours from the time your passengers booked.",
        { exact: true },
      )
      .filter(visible),
  ).toBeVisible();
  const label = "Leaving Mjódd bus terminal at";
  const field = await timeField(driver, label).getAttribute("aria-label");
  const [, before = ""] = /(\d\d:\d\d)$/.exec(field ?? "") ?? [];
  const after = later(before, 45);
  await chooseTime(driver, label, after);
  await driver.getByRole("button", { name: "Check the change", exact: true }).click();

  // The check: what changes for Dóra, before anything is saved.
  await expect(driver.getByRole("heading", { name: "Check the change" })).toBeVisible();
  const change = `Departure changed from ${before} to ${after}`;
  await expect(driver.getByText(change, { exact: true }).filter(visible)).toBeVisible();
  await expect(
    driver.getByText("1 passenger is told the new time now.", { exact: true }).filter(visible),
  ).toBeVisible();
  await expect(
    driver
      .getByText(
        "It moves more than 30 minutes from when they booked, so 1 passenger can cancel with a full refund, without it counting against them.",
        { exact: true },
      )
      .filter(visible),
  ).toBeVisible();
  await driver.getByRole("button", { name: "Save the change", exact: true }).click();

  // Back on the trip, it says so with focus.
  await expect(driver).toHaveURL(new RegExp(`/drive/trips/${tripId}\\?changed=`));
  const outcome = "Trip changed. Your passengers have been told.";
  await expect(driver.getByText(outcome, { exact: true }).filter(visible)).toBeVisible();
  await expect.poll(() => focused(driver)).toContain(outcome);

  // Dóra reads the change, and cancels with a full refund.
  await dora.goto(booking);
  await expect(dora.getByRole("heading", { name: "Changes since you booked" })).toBeVisible();
  await expect(dora.getByText(change, { exact: true }).filter(visible)).toBeVisible();
  await dora.getByRole("button", { name: "Cancel with full refund", exact: true }).click();
  await expect(dora).toHaveURL(`${booking}/cancel?reason=trip_changed`);
  await expect(dora.getByRole("radio", { name: "The trip changed" })).toBeChecked();
  await expect(dora.getByText(/^Full refund of [\d,]+ ISK$/).filter(visible)).toBeVisible();
  await expect(
    dora.getByText("This cancellation shows on your profile").filter(visible),
  ).toHaveCount(0);
  await dora.getByRole("button", { name: "Cancel booking", exact: true }).click();

  await expect(dora).toHaveURL(`${booking}?cancelled=1`);
  const cancelled = "You cancelled this booking: The trip changed";
  await expect(dora.getByText(cancelled, { exact: true }).filter(visible)).toBeVisible();
  await expect(
    dora.getByText(/^Full refund of [\d,]+ ISK, back to the card you paid with\.$/).filter(visible),
  ).toBeVisible();
  await close();
});
