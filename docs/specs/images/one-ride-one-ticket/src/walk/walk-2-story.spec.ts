import { test, type Page } from "@playwright/test";
import { apiUrl } from "../playwright.config";
import { english, newEmail, finishSignUp } from "./support/account";
import { emailedCode, signInCodeSubject } from "./support/email";
import { codeIn, newPhoneNumber, sentCount, textMessage } from "./support/sms";
import { secondPage } from "./support/cancelling";
import { chooseTime, tomorrow } from "./support/trips";
import { landscapeJpeg } from "./support/photo";
import { shot } from "./walk";

test.use({ locale: "en-GB" });

async function attempt(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (error) {
    console.log(`STEP FAILED: ${name}: ${String(error).slice(0, 400)}`);
  }
}

test("the whole story, driver and passenger", async ({ page: driver, browser }, info) => {
  const { page: passenger } = await secondPage(browser, info);
  const d = (name: string, whole = false) => shot(driver, info, "2-driver", name, whole);
  const p = (name: string, whole = false) => shot(passenger, info, "3-passenger", name, whole);

  // ---- The driver signs up, with a picture of each step.
  const signUpShots = async (page: Page, s: typeof d, name: string) => {
    const phone = newPhoneNumber();
    await page.goto("/profile");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await s("sign-in");
    const email = newEmail();
    await page.getByLabel("Email", { exact: true }).fill(email);
    const code = await emailedCode(email, signInCodeSubject, () =>
      page.getByRole("button", { name: "Send code", exact: true }).click(),
    );
    await s("sign-in-email-code");
    await page.getByLabel("6-digit code").fill(code);
    await page.getByRole("heading", { name: "Add your phone number" }).waitFor();
    await s("sign-up-phone");
    await page.getByLabel("Mobile number").fill(phone.local);
    const before = sentCount(phone.e164);
    await page.getByRole("button", { name: "Send code", exact: true }).click();
    const text = await textMessage(phone.e164, before + 1);
    await s("sign-up-phone-code");
    await page.getByLabel("6-digit code").fill(codeIn(text));
    await page.getByRole("heading", { name: "Last step: about you" }).waitFor();
    await s("sign-up-about-you", true);
    await finishSignUp(page, english, name);
    await page.getByRole("heading", { name: "Sign in faster next time" }).waitFor();
    await s("sign-up-faster");
    await page.getByRole("button", { name: "Not now", exact: true }).click();
    await page.getByRole("heading", { name: "Share your ride" }).waitFor();
    await s("front-signed-in");
    return { email, phone };
  };
  await signUpShots(driver, d, "Bára");

  // ---- Offer a ride, step by step.
  let tripId = "";
  await attempt("offer", async () => {
    const choose = async (end: "From" | "To", typed: string, card: RegExp) => {
      await driver.getByRole("button", { name: new RegExp(`^${end}: `) }).click();
      await driver.getByLabel(end, { exact: true }).fill(typed);
      await driver.getByRole("button", { name: card }).click();
    };
    await driver.goto("/offer");
    await driver.getByRole("heading", { name: "Where are you driving?" }).waitFor();
    await d("offer-1-route-empty", true);
    await choose("From", "mjódd", /^Mjódd bus terminal,/);
    await choose("To", "vík", /^N1 Vík,/);
    await d("offer-1-route-chosen", true);
    await driver.getByRole("button", { name: "Choose date and time" }).click();
    await d("offer-2-time-empty", true);
    const day = tomorrow("en");
    if (day.nextMonth) await driver.getByRole("button", { name: "Next month" }).click();
    await driver.getByRole("radio", { name: day.name }).click();
    await driver.getByRole("button", { name: /^Leaving Mjódd bus terminal at:? / }).click();
    await d("offer-2-time-wheel", true);
    await driver.getByRole("button", { name: "Done", exact: true }).click();
    await chooseTime(driver, "Leaving Mjódd bus terminal at", "18:30");
    await d("offer-2-time-chosen", true);
    await driver.getByRole("button", { name: "Choose seats" }).click();
    await d("offer-3-seats", true);
    await driver.getByRole("button", { name: "Set your price" }).click();
    await d("offer-4-price", true);
    await driver.getByRole("button", { name: "Check your ride" }).click();
    await d("offer-5-review-missing", true);
    const titled = (title: string) =>
      driver
        .getByTestId("screen-scroll")
        .filter({ has: driver.getByRole("heading", { name: title, exact: true }) });
    await titled("Check and publish").getByRole("button", { name: "Add a photo" }).click();
    await titled("Your profile photo").waitFor();
    await d("drive-photo", true);
    const picture = await landscapeJpeg(driver);
    const chooser = driver.waitForEvent("filechooser");
    await titled("Your profile photo").getByRole("button", { name: "Add a photo" }).click();
    await (await chooser).setFiles({ name: "me.jpg", mimeType: "image/jpeg", buffer: picture });
    await titled("Your profile photo").waitFor({ state: "hidden" });
    await driver.getByRole("button", { name: "Add a car" }).click();
    await d("drive-car-new", true);
    await driver.getByLabel("Make").fill("Toyota");
    await driver.getByLabel("Model").fill("Yaris");
    await driver.getByRole("radio", { name: "White" }).click();
    await driver.getByRole("button", { name: "Save car" }).click();
    await driver.getByRole("button", { name: "Confirm your licence" }).click();
    await d("drive-licence", true);
    await driver
      .getByRole("checkbox", {
        name: "I declare that I hold a valid driving licence for the cars I drive on PuffinRide",
      })
      .click();
    await driver.getByRole("button", { name: "Confirm", exact: true }).click();
    await driver.getByRole("button", { name: "Publish ride" }).waitFor();
    await d("offer-5-review-ready", true);
    await driver.getByRole("button", { name: "Publish ride" }).click();
    await driver.getByRole("heading", { name: "Your ride is published" }).waitFor();
    await d("offer-published", true);
    tripId = /\/drive\/trips\/([0-9a-f-]+)\/published/.exec(driver.url())?.[1] ?? "";
  });
  console.log("TRIP", tripId);

  await attempt("driver trip", async () => {
    await driver.goto(`/drive/trips/${tripId}`);
    await driver.waitForTimeout(1200);
    await d("driver-trip", true);
    await driver.goto(`/drive/trips/${tripId}/edit`);
    await driver.waitForTimeout(1000);
    await d("driver-trip-edit", true);
    await driver.goto(`/drive/trips/${tripId}/share`);
    await driver.waitForTimeout(1000);
    await d("driver-trip-share", true);
    await driver.goto(`/drive/trips`);
    await driver.waitForTimeout(1000);
    await d("driver-my-trips", true);
    await driver.goto(`/my-rides`);
    await driver.waitForTimeout(1000);
    await d("driver-my-rides", true);
    await driver.goto(`/offer`);
    await driver.waitForTimeout(1000);
    await d("offer-again", true);
  });

  // ---- The passenger signs up, looks around, and asks for a seat.
  await signUpShots(passenger, p, "Dóra");
  let booking = "";
  await attempt("request", async () => {
    await passenger.goto(`/trips/${tripId}?from=0&to=1`);
    await passenger.waitForTimeout(1200);
    await p("trip-request-mode", true);
    await passenger.getByRole("button", { name: "Send request", exact: true }).click();
    await passenger.waitForTimeout(800);
    await p("request-screen", true);
    await passenger.getByLabel("Message to the driver (optional)").fill("One small bag.");
    await passenger.getByRole("button", { name: "Send request", exact: true }).click();
    await passenger.waitForURL(/\/bookings\/[0-9a-f-]+\/booked$/);
    await p("request-sent", true);
    booking = passenger.url().replace(/\/booked$/, "");
    await passenger.goto(booking);
    await passenger.waitForTimeout(1000);
    await p("booking-requested", true);
    await passenger.goto("/my-rides");
    await passenger.waitForTimeout(1000);
    await p("my-rides-requested", true);
    await passenger.goto("/");
    await passenger.waitForTimeout(1000);
    await p("front-with-next-ride");
  });

  await attempt("accept", async () => {
    await driver.goto("/");
    await driver.waitForTimeout(1500);
    await shot(driver, info, "4-extra", "front-driver-request-waiting", true);
    await driver.goto("/my-rides");
    await driver.waitForTimeout(1500);
    await shot(driver, info, "4-extra", "my-rides-driver-request-waiting", true);
    await driver.goto("/drive/trips");
    await driver.waitForTimeout(1000);
    await d("driver-my-trips-1-request");
    await driver.goto(`/drive/trips/${tripId}`);
    await driver.getByRole("heading", { name: "Requests" }).waitFor();
    await d("driver-trip-request", true);
    await driver.getByRole("button", { name: "Accept", exact: true }).click();
    await driver.getByLabel("Dóra, 1 seat, Waiting for payment").waitFor();
    await d("driver-trip-accepted", true);
  });

  await attempt("pay", async () => {
    await passenger.goto(booking);
    await passenger.getByRole("button", { name: /^Pay [\d,]+ ISK$/ }).waitFor();
    await p("booking-accepted-pay", true);
    await passenger.getByRole("button", { name: /^Pay [\d,]+ ISK$/ }).click();
    await passenger.getByRole("heading", { name: "Test payment: no money moves" }).waitFor();
    await p("pay-sheet");
    await passenger.getByRole("button", { name: /^Pay [\d,]+ ISK$/ }).click();
    await passenger
      .getByText("Your seat is confirmed", { exact: true })
      .filter({ visible: true })
      .waitFor();
    await p("booking-confirmed", true);
  });

  await attempt("chat", async () => {
    await passenger.getByRole("button", { name: "Message Bára" }).click();
    await passenger.waitForURL(/\/messages\/[0-9a-f-]+$/);
    await passenger.waitForTimeout(1000);
    await p("chat-empty");
    await passenger.getByLabel("Write a message").fill("Where shall I wait?");
    await passenger.getByRole("button", { name: "Send", exact: true }).click();
    await passenger.waitForTimeout(1000);
    await p("chat-sent");
    await driver.goto("/");
    await driver.waitForTimeout(6000);
    await d("front-driver-with-unread");
    await driver.goto("/messages");
    await driver.waitForTimeout(1500);
    await d("messages-list");
    await driver.goto(`/drive/trips/${tripId}`);
    await driver.waitForTimeout(1500);
    await d("driver-trip-confirmed", true);
    await driver.goto(`/drive/trips/${tripId}/message`);
    await driver.waitForTimeout(1500);
    await d("driver-message-all", true);
    await passenger.goto("/messages");
    await passenger.waitForTimeout(1500);
    await p("messages-list");
    await passenger.goto("/my-rides");
    await passenger.waitForTimeout(1500);
    await p("my-rides-confirmed", true);
  });

  await attempt("profile", async () => {
    for (const path of [
      "/profile",
      "/profile/edit",
      "/profile/preview",
      "/settings",
      "/settings/sign-in-methods",
      "/settings/privacy",
      "/settings/email",
      "/settings/password",
      "/settings/blocked",
      "/settings/feedback",
      "/drive/cars",
      "/notices",
      "/feedback",
    ]) {
      await driver.goto(path);
      await driver.waitForTimeout(1200);
      await d(`page${path.replaceAll("/", "-")}`, true);
    }
  });

  await attempt("cancel screens", async () => {
    await passenger.goto(`${booking}/cancel`);
    await passenger.waitForTimeout(1200);
    await p("booking-cancel", true);
    await driver.goto(`/drive/trips/${tripId}/cancel`);
    await driver.waitForTimeout(1200);
    await d("driver-trip-cancel", true);
    for (const part of ["time", "seats", "price", "stop", "car", "booking", "details"]) {
      await driver.goto(`/drive/trips/${tripId}/edit/${part}`);
      await driver.waitForTimeout(1200);
      await d(`driver-edit-${part}`, true);
    }
  });

  // ---- Trip day.
  await attempt("trip day", async () => {
    await driver.request.post(`${apiUrl}/e2e/trips/${tripId}/move`, { data: { minutes: 10 } });
    await passenger.goto(booking);
    await passenger.getByRole("heading", { name: "Trip day" }).waitFor();
    await p("trip-day-passenger", true);
    await passenger.getByRole("button", { name: "I'm here", exact: true }).click();
    await passenger.waitForTimeout(1200);
    await p("trip-day-passenger-here", true);
    await driver.goto(`/drive/trips/${tripId}`);
    await driver.waitForTimeout(1500);
    await d("trip-day-driver", true);
    await passenger.goto("/");
    await passenger.waitForTimeout(1200);
    await p("front-trip-day");
    await passenger.goto("/my-rides");
    await passenger.waitForTimeout(1200);
    await p("my-rides-trip-day", true);
  });

  // ---- After the trip.
  await attempt("after", async () => {
    await driver.request.post(`${apiUrl}/e2e/trips/${tripId}/move`, {
      data: { minutes: -36 * 60 },
    });
    await passenger.goto(booking);
    await passenger.waitForTimeout(1500);
    await p("booking-after", true);
    await passenger.getByRole("button", { name: "Rate the driver" }).click();
    await passenger.waitForTimeout(1000);
    await p("rate", true);
    await passenger.getByRole("radio", { name: "5 stars" }).click();
    await passenger
      .getByLabel("Tell others what it was like (optional)")
      .fill("Lovely drive, right on time.");
    await passenger.getByRole("button", { name: "Send review" }).click();
    await passenger.waitForTimeout(1200);
    await p("rate-sent", true);
    await driver.goto(`/drive/trips/${tripId}`);
    await driver.waitForTimeout(1500);
    await d("driver-trip-after", true);
    await passenger.goto("/my-rides");
    await passenger.waitForTimeout(1200);
    await p("my-rides-after", true);
    await passenger.goto(`/trips/${tripId}`);
    await passenger.waitForTimeout(1200);
    await passenger
      .getByRole("link", { name: "See profile: Bára" })
      .filter({ visible: true })
      .click();
    await passenger.waitForTimeout(1500);
    await p("person-profile", true);
    await driver.goto("/drive/trips");
    await driver.waitForTimeout(1200);
    await d("driver-my-trips-after", true);
    await driver.goto("/my-rides");
    await driver.waitForTimeout(1200);
    await d("driver-my-rides-after", true);
  });
});
