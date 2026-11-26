import { expect, test } from "@playwright/test";
import { english, signUp } from "./support/account";
import { passengerRow } from "./support/driver-ride";
import { openConversation } from "./support/laptop";
import { postTripToSelfoss } from "./support/trips";

// Spec 7's chat on the web build, in two browsers: a driver posts Mjódd to
// N1 Selfoss for tomorrow, a passenger requests a seat, the driver accepts
// and the passenger pays. Then they write to each other: the driver sees the
// passenger's message counted on Messages in the menu, answers
// with a quick message in Icelandic, which the passenger reads in English,
// and the passenger sees "Seen" once the driver has opened the chat. Each
// project posts its own trip, so phone and desktop runs never meet.

test.use({ locale: "en-GB" });

test("the driver and passenger of a confirmed booking message each other", async ({
  page: driver,
  browser,
}, testInfo) => {
  // Two people sign up, book, pay and wait for each other's messages.
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
  // New messages come every 5 seconds while a chat is open.
  const nextFetch = { timeout: 15_000 } as const;

  // A confirmed booking, as in the request journey.
  await signUp(driver, english, "Bára");
  const tripId = await postTripToSelfoss(driver, "17:30");
  await signUp(passenger, english, "Dóra");
  await passenger.goto(`/trips/${tripId}?from=0&to=1`);
  await passenger.getByRole("button", { name: "Send request", exact: true }).click();
  await passenger.getByLabel("Message to the driver (optional)").fill("A small rucksack.");
  await passenger.getByRole("button", { name: "Send request", exact: true }).click();
  await expect(passenger).toHaveURL(/\/bookings\/[0-9a-f-]+\/booked$/);
  await driver.goto(`/drive/trips/${tripId}`);
  await driver.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(passengerRow(driver, "Dóra", "Waiting for payment")).toBeVisible();
  // No chat until the seat is paid for.
  await expect(driver.getByRole("button", { name: "Message Dóra" })).toHaveCount(0);
  await expect(driver.getByRole("link", { name: "Message all passengers" })).toHaveCount(0);
  await passenger.reload();
  await passenger.getByRole("button", { name: /^Pay [\d,]+ ISK$/ }).click();
  await passenger.getByRole("button", { name: /^Pay [\d,]+ ISK$/ }).click();
  await expect(
    passenger.getByText("Your seat is confirmed", { exact: true }).filter(visible),
  ).toBeVisible();

  // The passenger opens the chat from the booking and writes.
  await passenger.getByRole("link", { name: "Message Bára" }).click();
  await expect(passenger).toHaveURL(/\/messages\/[0-9a-f-]+$/);
  await expect(
    passenger
      .getByText("Pay only in the app. PuffinRide never asks for card details in a chat.")
      .filter(visible),
  ).toBeVisible();
  // On a laptop the list beside the conversation shows this line too, as
  // the conversation's last (spec 18, 3.11).
  const conversation = openConversation(passenger, testInfo);
  await expect(
    conversation.getByText("Booking confirmed. You can message each other here.").filter(visible),
  ).toBeVisible();
  await expect(passenger.getByLabel("You, Sent with the request: A small rucksack.")).toBeVisible();
  await passenger.getByLabel("Write a message").fill("Where shall I wait?");
  await passenger.getByRole("button", { name: "Send", exact: true }).click();
  await expect(passenger.getByLabel(/^You, \d\d:\d\d: Where shall I wait\?$/)).toBeVisible();
  await expect(passenger.getByLabel("Write a message")).toHaveValue("");

  // The driver's Messages place counts it.
  await driver.goto("/");
  await expect(
    driver.getByRole("link", { name: "Messages, 1 unread", exact: true }).filter(visible),
  ).toBeVisible();

  // The driver switches the app to Icelandic in Settings and answers from
  // the trip page.
  await driver.goto("/settings");
  // "Íslenska" is read with an Icelandic voice in the English app.
  await expect(driver.getByRole("radio", { name: "Íslenska" })).toHaveAttribute("lang", "is");
  await driver.getByRole("radio", { name: "Íslenska" }).click();
  await expect(driver.getByRole("radio", { name: "Íslenska" })).toBeChecked();
  await driver.goto(`/drive/trips/${tripId}`);
  await driver.getByRole("button", { name: "Senda skilaboð: Dóra" }).click();
  await expect(driver.getByLabel(/^Dóra, \d\d:\d\d: Where shall I wait\?$/)).toBeVisible();
  await driver.getByRole("button", { name: "Ég er á mótsstaðnum" }).click();
  await expect(driver.getByLabel(/^Þú, \d\d:\d\d: Ég er á mótsstaðnum$/)).toBeVisible();

  // The passenger reads it in English, and her message shows "Seen".
  await expect(passenger.getByLabel(/^Bára, \d\d:\d\d: I'm at the meeting point$/)).toBeVisible(
    nextFetch,
  );
  await expect(passenger.getByLabel(/^You, \d\d:\d\d: Where shall I wait\? Seen$/)).toBeVisible(
    nextFetch,
  );
  await passengerContext.close();
});
