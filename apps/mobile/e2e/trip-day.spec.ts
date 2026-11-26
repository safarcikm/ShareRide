import { expect, test } from "@playwright/test";
import { apiUrl } from "../playwright.config";
import { confirmedBooking, secondPage, visible } from "./support/cancelling";

// Spec 8's trip day, on the web build: Bára posts Mjódd to N1 Selfoss for
// tomorrow and Dóra books and pays, as in the cancelling journeys. Then the
// test API moves that one trip so it leaves Mjódd in 10 minutes (never the
// clock the other journeys share), and both open it on the day: each says
// "I'm here" with one tap and sees the other's, the passenger without
// reloading. The passenger's first screen has "I'm here" inside it, with
// no scrolling (spec 31, 3.9). The window's edges and the no-show are left
// to the API and screen tests. Each test posts its own trip, so phone and
// desktop runs never meet.

test.use({ locale: "en-GB" });

test("on the trip day, the passenger and the driver each say I'm here and see the other's", async ({
  page: driver,
  browser,
}, testInfo) => {
  test.slow();
  const { page: passenger, close } = await secondPage(browser, testInfo);
  const { tripId, booking } = await confirmedBooking(driver, passenger);
  const moved = await driver.request.post(`${apiUrl}/e2e/trips/${tripId}/move`, {
    data: { minutes: 10 },
  });
  expect(moved.status()).toBe(204);

  // The passenger's booking opens on the day (spec 31, 3.9): its title
  // counts down, where to stand comes first, and "I'm here" is on the first
  // screen, with no scrolling: in the bar at the bottom of a phone, at the
  // top of the side column on a laptop.
  await passenger.goto(booking);
  const title = passenger.getByRole("heading", { name: /^Leaves in \d+ minutes?$/ });
  await expect(title).toBeVisible();
  const imHere = passenger.getByRole("button", { name: "I'm here", exact: true });
  await expect(imHere).toBeVisible();
  const screenful = passenger.viewportSize();
  if (screenful === null) throw new Error("No viewport");
  for (const part of [
    title,
    passenger.getByRole("heading", { name: "Where to stand" }).filter(visible),
    imHere,
  ]) {
    await expect(part).toBeInViewport({ ratio: 1 });
    const place = await part.boundingBox();
    if (place === null) throw new Error("Not on screen");
    expect(place.y + place.height).toBeLessThanOrEqual(screenful.height);
  }
  await imHere.click();
  await expect(
    passenger.getByText("We've told the driver you're here.", { exact: true }).filter(visible),
  ).toBeVisible();

  // The driver, parked, sees Dóra is here, and says so at Mjódd.
  await driver.goto(`/drive/trips/${tripId}`);
  await expect(
    driver.getByText("Use this only when parked.", { exact: true }).filter(visible),
  ).toBeVisible();
  await expect(driver.getByLabel("Dóra, 1 seat, Here")).toBeVisible();
  await driver.getByRole("button", { name: "I'm here at Mjódd bus terminal" }).click();
  await expect(
    driver.getByText("We've told your passengers you're here.", { exact: true }).filter(visible),
  ).toBeVisible();

  // And Dóra's page, left open, says in its title that Bára is there, within
  // half a minute.
  await expect(
    passenger.getByRole("heading", { name: "Bára is at the meeting point" }),
  ).toBeVisible({ timeout: 45_000 });
  await close();
});
