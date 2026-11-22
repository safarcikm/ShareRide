import { expect, test } from "@playwright/test";
import { english, signUp } from "./support/account";
import { emailTo, linkIn } from "./support/email";
import { postTripToSelfoss } from "./support/trips";

// An email on the web build (plan 4.6; spec 20, 3.3): a passenger gives an
// address at sign-up, sees in Settings that its link waits, opens the link
// from the test API's email outbox, and then, with no push in a browser,
// gets the "Pay now" email when the driver accepts their request. The
// address is new each run and project.

test.use({ locale: "en-GB" });

test("a passenger confirms the email given at sign-up and gets the Pay now email", async ({
  page: passenger,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL } =
    testInfo.project.use;
  const driverContext = await browser.newContext({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    baseURL,
    locale: "en-GB",
  });
  const driver = await driverContext.newPage();
  const visible = { visible: true } as const;

  // Step 3 asked for the email; Settings, Your account, shows its link waiting.
  const { email: address } = await signUp(passenger, english, "Edda");
  await passenger.goto("/settings");
  await expect(passenger.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expect(
    passenger
      .getByText(`Waiting for you to open the link sent to ${address}.`, { exact: true })
      .filter(visible),
  ).toBeVisible();

  // The link opens the web app, which confirms the address.
  const confirm = await emailTo(address, /^Confirm your email for PuffinRide$/);
  const link = linkIn(confirm, "Confirm my email");
  expect(link).toMatch(/\/verify-email#sr_ev_/);
  await passenger.goto(link);
  await expect(passenger.getByRole("heading", { name: "Your email is added" })).toBeVisible();
  await expect(passenger).toHaveURL(/\/verify-email$/);
  await passenger.getByRole("link", { name: "Go to Settings" }).click();
  await expect(passenger.getByText(address, { exact: true }).filter(visible)).toBeVisible();
  await expect(passenger.getByRole("link", { name: "Change your email" })).toBeVisible();

  // A request, accepted: the passenger has no push here, so email tells them.
  await signUp(driver, english, "Bára");
  const tripId = await postTripToSelfoss(driver, "17:30");
  await passenger.goto(`/trips/${tripId}?from=0&to=1`);
  await passenger.getByRole("button", { name: "Send request", exact: true }).click();
  await passenger.getByLabel("Message to the driver (optional)").fill("One small bag.");
  await passenger.getByRole("button", { name: "Send request", exact: true }).click();
  await expect(passenger).toHaveURL(/\/bookings\/[0-9a-f-]+\/booked$/);
  await expect(passenger.getByRole("heading", { name: "Request sent" })).toBeVisible();
  // The email opens the booking itself, not this finish screen.
  const bookingPath = new URL(passenger.url()).pathname.replace(/\/booked$/, "");
  await driver.goto(`/drive/trips/${tripId}`);
  await driver.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(driver.getByRole("heading", { name: "Passengers" })).toBeVisible();

  const payNow = await emailTo(address, /^Pay now: /);
  expect(payNow.text).toMatch(/^Pay now: .+\n\nPay [\d,]+ ISK by \d\d:\d\d to confirm your seat\./);
  expect(linkIn(payNow, "Open in PuffinRide")).toBe(`${baseURL ?? ""}${bookingPath}`);
  await driverContext.close();
});
