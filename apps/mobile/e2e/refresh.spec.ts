import { expect, test, type Page } from "@playwright/test";

/** Counts the front page's calls for the rides leaving soon from now on. */
function countSoonest(page: Page) {
  let count = 0;
  page.on("request", (request) => {
    if (request.url().includes("/v1/trips/soonest")) count += 1;
  });
  return () => count;
}

/**
 * Pulls the page down with one finger from `fromY` by `by`, as a phone's
 * browser sends it: real touch events, which the page may stop scrolling.
 */
async function pull(page: Page, fromY: number, by: number) {
  const cdp = await page.context().newCDPSession(page);
  const x = (page.viewportSize()?.width ?? 400) / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y: fromY }],
  });
  const steps = 12;
  for (let step = 1; step <= steps; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: fromY + (by * step) / steps }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

test.describe("Pull to refresh and the logo (spec 16, 3.9)", () => {
  test.use({ locale: "en-GB" });

  test("pulling Find down loads its rides again and says Updated", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "Only a touch screen pulls.");
    await page.goto("/");
    const title = page.getByRole("heading", { name: "Share your ride" });
    await expect(title).toBeVisible();
    await expect(page.getByTestId("trip-result").first()).toBeVisible();
    const soonest = countSoonest(page);
    const box = await title.boundingBox();
    if (box === null) throw new Error("The title has no place on the page.");

    // A short pull does nothing.
    await pull(page, box.y, 60);
    await expect(page.getByTestId("refresh-pull")).toBeHidden();
    expect(soonest()).toBe(0);

    await pull(page, box.y, 240);
    await expect(page.getByText("Updated", { exact: true })).toBeVisible();
    expect(soonest()).toBe(1);
    // The page stayed where it was, and Updated goes by itself.
    await expect(title).toBeInViewport();
    await expect(page.getByText("Updated", { exact: true })).toBeHidden({ timeout: 5000 });
  });

  test("the logo loads Find again", async ({ page }, testInfo) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Share your ride" })).toBeVisible();
    await expect(page.getByTestId("trip-result").first()).toBeVisible();
    const soonest = countSoonest(page);
    if (testInfo.project.name === "phone") {
      await page.getByRole("button", { name: "PuffinRide, update the front page" }).click();
    } else {
      // From another place, the logo in the top bar opens Find and loads it again.
      await page.getByRole("link", { name: "Profile" }).click();
      await expect(page).toHaveURL(/\/profile$/);
      await page.getByRole("link", { name: "PuffinRide, to the front page" }).click();
      await expect(page).toHaveURL(/\/$/);
    }
    await expect(page.getByText("Updated", { exact: true })).toBeVisible();
    expect(soonest()).toBe(1);
  });
});
