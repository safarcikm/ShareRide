import { expect, test } from "@playwright/test";
import { english, signUp } from "./support/account";
import { focused, postTripToSelfoss } from "./support/trips";

// Spec 9's reporting on the web build, in two browsers: a driver posts a
// trip, another person reports it as not as listed, is thanked, and finds
// the report on Profile, under My reports, still open. The driver is not
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
  await expect(driver.getByRole("heading", { name: "Your part of the ride" })).toBeVisible();
  await expect(driver.getByRole("link", { name: "Report this ride" })).toHaveCount(0);

  await signUp(reporter, english, "Dóra");
  await reporter.goto(`/trips/${tripId}?from=0&to=1`);
  await reporter.getByRole("link", { name: "Report this ride" }).click();
  await expect(reporter.getByRole("heading", { name: "Report this ride" })).toBeVisible();

  // Nothing is sent before choosing what happened: why stands over the
  // button, in the bar, and takes focus (spec 31, 3.19).
  const bar = reporter.getByTestId("bottom-bar").filter(visible);
  await bar.getByRole("button", { name: "Send report" }).click();
  await expect(bar.getByRole("alert")).toHaveText("Choose what happened.");
  await expect(bar.getByRole("alert")).toBeInViewport();
  await expect.poll(() => focused(reporter)).toContain("Choose what happened.");
  await reporter.getByRole("radio", { name: "The ride wasn't as listed" }).click();
  await reporter.getByLabel("Tell us more (optional)").fill("The car was not the one listed.");
  await reporter.getByRole("button", { name: "Send report" }).click();
  await expect(
    reporter.getByRole("heading", { name: "Thank you. We look at every report." }),
  ).toBeVisible();
  // The thanks are the title, with focus; the way back is the main button.
  await expect.poll(() => focused(reporter)).toContain("Thank you. We look at every report.");
  await expect(
    reporter.getByTestId("bottom-bar").filter(visible).getByRole("button", { name: "Back" }),
  ).toBeInViewport();

  await reporter.goto("/profile");
  await reporter.getByRole("link", { name: "My reports" }).click();
  await expect(reporter.getByText("Ride: Bára", { exact: true }).filter(visible)).toBeVisible();
  await expect(
    reporter.getByText(/^The ride wasn't as listed · Sent /).filter(visible),
  ).toBeVisible();
  await expect(
    reporter.getByText("We look at every report within 24 hours.").filter(visible),
  ).toBeVisible();

  await reporterContext.close();
});
