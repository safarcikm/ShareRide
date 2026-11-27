import { expect, test } from "@playwright/test";
import { english, newEmail, signUp } from "./support/account";
import { confirmCodeSubject, emailedCode, emailTo, linkIn } from "./support/email";
import { postTripToSelfoss } from "./support/trips";

// An email on the web build (plan 4.6; spec 26, 3.7): a passenger signs up
// with an email and sees it on Profile, changes it with a confirm code
// emailed to the address she has, opens the new address's link from the
// test API's email outbox, and the old address is told. Then, with no push in a
// browser, they get the "Pay now" email at the new address when the driver
// accepts their request. The addresses are new each run and project.

test.use({ locale: "en-GB" });

test("a passenger changes their email and gets the Pay now email there", async ({
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

  // Profile, under Account, shows the email she signed up with.
  const { email: first } = await signUp(passenger, english, "Edda");
  await passenger.goto("/profile");
  await expect(passenger.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
  const emailRow = (email: string) =>
    passenger.getByRole("link", { name: `Email, ${email}`, exact: true }).filter(visible);
  await expect(emailRow(first)).toBeVisible();

  // A new address signs in, so it takes a code sent to the one she has
  // (spec 26, R26.5), then waits for its link.
  const address = newEmail();
  await emailRow(first).click();
  await passenger.getByRole("textbox", { name: "Email", exact: true }).fill(address);
  const code = await emailedCode(first, confirmCodeSubject, () =>
    passenger.getByRole("button", { name: "Send the link" }).click(),
  );
  await expect(
    passenger.getByText(`We emailed a code to ${first.slice(0, 2)}•••@example.com.`),
  ).toBeVisible();
  await passenger.getByLabel("6-digit code").fill(code);
  await expect(
    passenger
      .getByText(`We sent a link to ${address}. Open it within 24 hours to add the address.`)
      .filter(visible),
  ).toBeVisible();

  // The link opens the web app, which confirms the address.
  const confirm = await emailTo(address, /^Confirm your email for PuffinRide$/);
  const link = linkIn(confirm, "Confirm my email");
  expect(link).toMatch(/\/verify-email#sr_ev_/);
  await passenger.goto(link);
  await expect(passenger.getByRole("heading", { name: "Your email is added" })).toBeVisible();
  await expect(passenger).toHaveURL(/\/verify-email$/);
  await passenger.getByRole("link", { name: "Go to your profile" }).click();
  await expect(emailRow(address)).toBeVisible();
  // The old address is told, in case it was not her (spec 26, R26.6).
  await emailTo(first, /^Your PuffinRide sign-in email changed$/);

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
