import { expect, test, type Page } from "@playwright/test";
import { english, signUp } from "./support/account";
import {
  confirmedBooking,
  requestSeat,
  secondPage,
  visible,
  withinADay,
} from "./support/cancelling";
import { openConversation } from "./support/laptop";
import { chooseTime, focused, postTripToSelfoss, timeField } from "./support/trips";

// Spec 6, 3.2, on the web build: a driver posts Mjódd to N1 Selfoss for
// tomorrow and Dóra pays for a seat. The driver moves the departure 45
// minutes later: the check says Dóra is told and may cancel with a full
// refund (R6.3). Dóra reads the change on her booking and cancels with a
// full refund, "The trip changed" chosen, without it counting.

test.use({ locale: "en-GB" });

/** The parts of a trip's summary on the screen in view; a screen under it stays in the page. */
const shownParts = '[data-testid="summary-section"]';

function partsOf(page: Page): Promise<number> {
  return page.evaluate(
    (parts) =>
      [...document.querySelectorAll(parts)].filter((part) => part.getClientRects().length > 0)
        .length,
    shownParts,
  );
}

/** The links that reach past the left or right edge of the part they change. */
function linksOutsideTheirPart(page: Page): Promise<string[]> {
  return page.evaluate(
    (parts) =>
      [...document.querySelectorAll(parts)]
        .filter((part) => part.getClientRects().length > 0)
        .flatMap((part) => {
          const box = part.getBoundingClientRect();
          return [...part.querySelectorAll("a")]
            .filter((link) => {
              const at = link.getBoundingClientRect();
              return at.left < box.left - 0.5 || at.right > box.right + 0.5;
            })
            .map((link) => link.textContent);
        }),
    shownParts,
  );
}

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
  await driver.getByRole("link", { name: "Edit the ride", exact: true }).click();
  await expect(driver).toHaveURL(new RegExp(`/drive/trips/${tripId}/edit$`));
  await expect(driver.getByRole("heading", { name: "Edit the ride" })).toBeVisible();
  // On a narrow phone a part's link is wider than what its title leaves:
  // it goes under the title, and never out of the card (spec 31, 3.18).
  const size = driver.viewportSize();
  if (testInfo.project.use.isMobile === true && size !== null) {
    await driver.setViewportSize({ width: 360, height: size.height });
    await expect.poll(() => partsOf(driver)).toBe(7);
    expect(await linksOutsideTheirPart(driver)).toEqual([]);
    await driver.setViewportSize(size);
  }
  await driver.getByRole("link", { name: "Change the time" }).click();
  await expect(driver.getByRole("heading", { name: "Change the departure" })).toBeVisible();
  await expect(
    driver
      .getByText(
        "With bookings, the departure can move by up to 2 h from the time your passengers booked.",
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
        "It moves far enough from when they booked that 1 passenger can cancel with a full refund, without it counting against them.",
        { exact: true },
      )
      .filter(visible),
  ).toBeVisible();
  await driver.getByRole("button", { name: "Save the change", exact: true }).click();

  // Back on the trip, it says so with focus.
  await expect(driver).toHaveURL(new RegExp(`/drive/trips/${tripId}\\?changed=`));
  const outcome = "Ride changed. Your passengers have been told.";
  await expect(driver.getByText(outcome, { exact: true }).filter(visible)).toBeVisible();
  await expect.poll(() => focused(driver)).toContain(outcome);

  // Dóra reads the change, and cancels with a full refund.
  await dora.goto(booking);
  await expect(dora.getByRole("heading", { name: "Changes since you booked" })).toBeVisible();
  await expect(dora.getByText(change, { exact: true }).filter(visible)).toBeVisible();
  await dora.getByRole("button", { name: "Cancel with full refund", exact: true }).click();
  await expect(dora).toHaveURL(`${booking}/cancel?reason=trip_changed`);
  await expect(dora.getByRole("radio", { name: "The ride changed" })).toBeChecked();
  await expect(dora.getByText(/^Full refund of [\d,]+ ISK$/).filter(visible)).toBeVisible();
  await expect(
    dora.getByText("This cancellation shows on your profile").filter(visible),
  ).toHaveCount(0);
  await dora.getByRole("button", { name: "Cancel booking", exact: true }).click();

  await expect(dora).toHaveURL(`${booking}?cancelled=1`);
  const cancelled = "You cancelled this booking: The ride changed";
  await expect(dora.getByText(cancelled, { exact: true }).filter(visible)).toBeVisible();
  await expect(
    dora.getByText(/^Full refund of [\d,]+ ISK, back to the card you paid with\.$/).filter(visible),
  ).toBeVisible();
  await close();
});

// Spec 6, 3.2, items 8 to 10: with Dóra's request holding a seat, the
// driver offers no more seats than are taken, then raises the price for
// new bookings; nobody is told, and Edit trip shows both.
test("a driver offers fewer seats and a higher price, each saved from Edit trip", async ({
  page: driver,
  browser,
}, testInfo) => {
  test.slow();
  const { page: dora, close } = await secondPage(browser, testInfo);
  await signUp(driver, english, "Bára");
  const tripId = await postTripToSelfoss(driver, withinADay());
  await requestSeat(dora, "Dóra", tripId);

  const edit = async () => {
    await driver.goto(`/drive/trips/${tripId}/edit`);
    await expect(driver.getByRole("heading", { name: "Edit the ride" })).toBeVisible();
  };
  const saved = async () => {
    await driver.getByRole("button", { name: "Save the change", exact: true }).click();
    await expect(driver).toHaveURL(new RegExp(`/drive/trips/${tripId}\\?changed=`));
    const outcome = "Ride changed.";
    await expect(driver.getByText(outcome, { exact: true }).filter(visible)).toBeVisible();
    await expect.poll(() => focused(driver)).toContain(outcome);
  };

  await edit();
  await driver.getByRole("link", { name: "Change the seats" }).click();
  await expect(
    driver
      .getByText("1 seat is taken on part of the ride, so you can offer no fewer.", {
        exact: true,
      })
      .filter(visible),
  ).toBeVisible();
  const fewer = driver.getByRole("button", { name: "One seat fewer" });
  while (await fewer.isEnabled()) await fewer.click();
  await saved();

  await edit();
  await expect(driver.getByText("1 seat", { exact: true }).filter(visible)).toBeVisible();
  await expect(
    driver.getByText(/^100% · the whole route [\d,]+ ISK$/).filter(visible),
  ).toBeVisible();
  await driver.getByRole("link", { name: "Change the price" }).click();
  await expect(
    driver
      .getByText(
        "The new price is for new bookings. Passengers who booked keep the price they booked at.",
        { exact: true },
      )
      .filter(visible),
  ).toBeVisible();
  await driver.getByRole("button", { name: "Raise the price" }).click();
  await saved();

  await edit();
  await expect(
    driver.getByText(/^110% · the whole route [\d,]+ ISK$/).filter(visible),
  ).toBeVisible();
  await close();
});

// Spec 6, 3.2: the driver adds a second car and changes the trip to it;
// Dóra, who paid, is told, and reads the new car on her booking and in the
// chat.
test("a driver changes the car, and the passenger reads it on the booking and in the chat", async ({
  page: driver,
  browser,
}, testInfo) => {
  test.slow();
  const { page: dora, close } = await secondPage(browser, testInfo);
  const { tripId, booking } = await confirmedBooking(driver, dora);

  await driver.goto(`/drive/trips/${tripId}/edit`);
  await expect(
    driver.getByText("Toyota Yaris, white", { exact: true }).filter(visible),
  ).toBeVisible();
  await driver.getByRole("link", { name: "Change the car" }).click();
  await expect(driver.getByRole("heading", { name: "Change the car" })).toBeVisible();
  await expect(
    driver
      .getByText("Passengers who have booked are told about the new car when you save.", {
        exact: true,
      })
      .filter(visible),
  ).toBeVisible();

  // Add a car comes back here, with the new car to choose.
  await driver.getByRole("link", { name: "Add a car" }).click();
  await driver.getByLabel("Make").fill("Volvo");
  await driver.getByLabel("Model").fill("XC40");
  await driver.getByRole("radio", { name: "Red" }).click();
  await driver.getByRole("button", { name: "Save car" }).click();
  await expect(driver).toHaveURL(new RegExp(`/drive/trips/${tripId}/edit/car$`));
  await driver.getByRole("radio", { name: /^Volvo XC40, red/ }).click();
  await driver.getByRole("button", { name: "Save the change", exact: true }).click();
  await expect(driver).toHaveURL(new RegExp(`/drive/trips/${tripId}\\?changed=`));
  const outcome = "Ride changed. Your passengers have been told.";
  await expect(driver.getByText(outcome, { exact: true }).filter(visible)).toBeVisible();

  const newCar = "New car: Red Volvo XC40";
  await dora.goto(booking);
  await expect(dora.getByRole("heading", { name: "Changes since you booked" })).toBeVisible();
  await expect(dora.getByText(newCar, { exact: true }).filter(visible)).toBeVisible();
  const [, bookingId = ""] = /\/bookings\/([0-9a-f-]+)$/.exec(booking) ?? [];
  await dora.goto(`/messages/${bookingId}`);
  await expect(
    openConversation(dora, testInfo).getByText(newCar, { exact: true }).filter(visible),
  ).toBeVisible();
  await close();
});

// Spec 6, 3.2 (milestone 6 plan, decision 2): the driver skipped N1
// Hveragerði when posting, and adds it back between Olís Norðlingaholt and
// N1 Selfoss. The check says where and when it goes, what the new stretches
// cost new passengers and that Dóra is told; Dóra keeps her stops and
// price, and reads the new stop on her booking and in the chat.
test("a driver adds a stop on the way, and the passenger reads it on the booking and in the chat", async ({
  page: driver,
  browser,
}, testInfo) => {
  test.slow();
  const { page: dora, close } = await secondPage(browser, testInfo);
  const { tripId, booking } = await confirmedBooking(driver, dora, ["N1 Hveragerði"]);

  await driver.goto(`/drive/trips/${tripId}/edit`);
  await expect(
    driver
      .getByText("Mjódd bus terminal → Olís Norðlingaholt → N1 Selfoss", { exact: true })
      .filter(visible),
  ).toBeVisible();
  await driver.getByRole("link", { name: "Add a stop" }).click();
  await driver.getByLabel("Town or meeting point").fill("hverag");
  await driver.getByRole("button", { name: /^N1 Hveragerði,/ }).click();

  // The check, before anything is saved.
  await expect(driver.getByRole("heading", { name: "Check the change" })).toBeVisible();
  const newStop = /^New stop: N1 Hveragerði at \d\d:\d\d$/;
  await expect(driver.getByText(newStop).filter(visible)).toBeVisible();
  await expect(
    driver.getByText(/^Olís Norðlingaholt → N1 Hveragerði · [\d,]+ ISK per seat$/).filter(visible),
  ).toBeVisible();
  await expect(
    driver.getByText(/^N1 Hveragerði → N1 Selfoss · [\d,]+ ISK per seat$/).filter(visible),
  ).toBeVisible();
  await expect(
    driver.getByText("1 passenger is told of the new stop now.", { exact: true }).filter(visible),
  ).toBeVisible();
  await driver.getByRole("button", { name: "Save the change", exact: true }).click();
  await expect(driver).toHaveURL(new RegExp(`/drive/trips/${tripId}\\?changed=`));
  const outcome = "Ride changed. Your passengers have been told.";
  await expect(driver.getByText(outcome, { exact: true }).filter(visible)).toBeVisible();

  await dora.goto(booking);
  await expect(dora.getByRole("heading", { name: "Changes since you booked" })).toBeVisible();
  await expect(dora.getByText(newStop).filter(visible)).toBeVisible();
  const [, bookingId = ""] = /\/bookings\/([0-9a-f-]+)$/.exec(booking) ?? [];
  await dora.goto(`/messages/${bookingId}`);
  await expect(openConversation(dora, testInfo).getByText(newStop).filter(visible)).toBeVisible();
  await close();
});

// Spec 6, 3.2 (R6.5): Dóra gets out at Olís Norðlingaholt, so it cannot be
// removed; N1 Hveragerði, which nobody uses, can. The check says the way
// past it costs new passengers and that Dóra is told; Dóra reads it on her
// booking and in the chat.
test("a driver removes a stop nobody uses, and the passenger reads it on the booking and in the chat", async ({
  page: driver,
  browser,
}, testInfo) => {
  test.slow();
  const { page: dora, close } = await secondPage(browser, testInfo);
  const { tripId, booking } = await confirmedBooking(driver, dora);

  await driver.goto(`/drive/trips/${tripId}/edit`);
  await expect(
    driver
      .getByText("Mjódd bus terminal → Olís Norðlingaholt → N1 Hveragerði → N1 Selfoss", {
        exact: true,
      })
      .filter(visible),
  ).toBeVisible();
  await driver.getByRole("link", { name: "Remove a stop" }).click();
  const check = driver.getByRole("button", { name: "Check the change", exact: true });
  await driver.getByRole("radio", { name: /^Olís Norðlingaholt/ }).click();
  await check.click();
  await expect(
    driver
      .getByText(
        "1 passenger gets in or out at Olís Norðlingaholt. Cancel or decline their bookings on this ride first, or ask them to cancel.",
        { exact: true },
      )
      .filter(visible),
  ).toBeVisible();
  await driver.getByRole("button", { name: "Choose another stop", exact: true }).click();
  await driver.getByRole("radio", { name: /^N1 Hveragerði/ }).click();
  await check.click();

  // The check, before anything is saved.
  await expect(driver.getByRole("heading", { name: "Check the change" })).toBeVisible();
  const removed = "Stop removed: N1 Hveragerði";
  await expect(driver.getByText(removed, { exact: true }).filter(visible)).toBeVisible();
  await expect(
    driver.getByText(/^Olís Norðlingaholt → N1 Selfoss · [\d,]+ ISK per seat$/).filter(visible),
  ).toBeVisible();
  await expect(
    driver
      .getByText("1 passenger is told the stop is removed now.", { exact: true })
      .filter(visible),
  ).toBeVisible();
  await driver.getByRole("button", { name: "Save the change", exact: true }).click();
  await expect(driver).toHaveURL(new RegExp(`/drive/trips/${tripId}\\?changed=`));
  const outcome = "Ride changed. Your passengers have been told.";
  await expect(driver.getByText(outcome, { exact: true }).filter(visible)).toBeVisible();

  await dora.goto(booking);
  await expect(dora.getByRole("heading", { name: "Changes since you booked" })).toBeVisible();
  await expect(dora.getByText(removed, { exact: true }).filter(visible)).toBeVisible();
  const [, bookingId = ""] = /\/bookings\/([0-9a-f-]+)$/.exec(booking) ?? [];
  await dora.goto(`/messages/${bookingId}`);
  await expect(
    openConversation(dora, testInfo).getByText(removed, { exact: true }).filter(visible),
  ).toBeVisible();
  await close();
});
