import { expect, test } from "@playwright/test";
import { english, signUp } from "./support/account";
import { postTripToSelfoss } from "./support/trips";

// Spec 9's reporting on the web build, in two browsers: a driver posts a
// trip, another person reports it as not as listed, is thanked, and finds
// the report in Settings, under My reports, still open. The driver is not
// offered to report their own trip. Each project posts its own trips, so
// phone and desktop runs never meet.

test.use({ locale: "en-GB" });

test("a person reports a trip and finds it in My reports", async ({
  page: driver,
  browser,
}, testInfo) => {
  test.slow();
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL } =
    testInfo.project.use;
  const reporterContext = await browser.newContext({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    baseURL,
    locale: "en-GB",
  });
  const reporter = await reporterContext.newPage();
  const visible = { visible: true } as const;

  await signUp(driver, english, "Bára");
  const tripId = await postTripToSelfoss(driver, "17:30");
  // The driver is not offered to report their own trip.
  await driver.goto(`/trips/${tripId}?from=0&to=1`);
  await expect(driver.getByRole("heading", { name: "Who you ride with" })).toBeVisible();
  await expect(driver.getByRole("button", { name: "Report this ride" })).toHaveCount(0);

  await signUp(reporter, english, "Dóra");
  await reporter.goto(`/trips/${tripId}?from=0&to=1`);
  await reporter.getByRole("button", { name: "Report this ride" }).click();
  await expect(reporter.getByRole("heading", { name: "Report this ride" })).toBeVisible();

  // Nothing is sent before choosing what happened.
  await reporter.getByRole("button", { name: "Send report" }).click();
  await expect(reporter.getByText("Choose what happened.").filter(visible)).toBeVisible();
  await reporter.getByRole("radio", { name: "The ride wasn't as listed" }).click();
  await reporter.getByLabel("Tell us more (optional)").fill("The car was not the one listed.");
  await reporter.getByRole("button", { name: "Send report" }).click();
  await expect(
    reporter.getByRole("heading", { name: "Thank you. We look at every report." }),
  ).toBeVisible();

  await reporter.goto("/settings");
  await reporter.getByRole("button", { name: "My reports" }).click();
  await expect(reporter.getByText("Ride: Bára", { exact: true }).filter(visible)).toBeVisible();
  await expect(
    reporter.getByText(/^The ride wasn't as listed · Sent /).filter(visible),
  ).toBeVisible();
  await expect(
    reporter.getByText("We look at every report within 24 hours.").filter(visible),
  ).toBeVisible();

  await reporterContext.close();
});
