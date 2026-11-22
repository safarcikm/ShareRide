import { expect, test, type Page } from "@playwright/test";

// Google Analytics on the website, only after the visitor accepts (spec 23,
// 3.1 to 3.3). The test API has no measurement ID, so this journey's config
// names one, and nothing reaches Google: its tag is an empty stand-in that
// records only that it was asked for.

const id = "G-TEST123456";
const google = /googletagmanager\.com|google-analytics\.com|analytics\.google\.com/;

async function siteWithAnalytics(page: Page): Promise<string[]> {
  const asked: string[] = [];
  await page.route("**/v1/config", async (route) => {
    const response = await route.fetch();
    const config = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...config, analytics: { googleMeasurementId: id } } });
  });
  await page.route(google, async (route) => {
    asked.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
  });
  return asked;
}

/** The page views given to Google's tag: where each says it is, and its title. */
function pageViews(page: Page) {
  return page.evaluate(() => {
    const queue = (globalThis as { dataLayer?: IArguments[] }).dataLayer ?? [];
    return queue
      .map((command) => [...command] as unknown[])
      .filter((command) => command[0] === "event" && command[1] === "page_view")
      .map((command) => command[2] as { page_location: string; page_title: string });
  });
}

const question = (page: Page) => page.getByRole("region", { name: "Cookies" });

test.describe("Google Analytics on the website", () => {
  test.use({ locale: "en-GB" });

  test("asks first, loads nothing from Google before Accept, then counts screens by pattern", async ({
    page,
  }) => {
    const asked = await siteWithAnalytics(page);
    // Opened from a flyer's QR code.
    await page.goto("/meeting-points?lang=en&utm_source=flyer&utm_medium=qr");
    await expect(question(page)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Meeting points" })).toBeVisible();
    expect(asked).toEqual([]);
    expect(await page.evaluate(() => "dataLayer" in globalThis)).toBe(false);

    await question(page).getByRole("button", { name: "Accept" }).click();
    await expect(question(page)).toBeHidden();
    await expect.poll(() => asked).toEqual([`https://www.googletagmanager.com/gtag/js?id=${id}`]);
    const origin = new URL(page.url()).origin;
    // The screen open now, with the flyer's campaign tags and nothing else of its address.
    await expect
      .poll(async () => (await pageViews(page)).map((view) => view.page_location))
      .toEqual([`${origin}/meeting-points?utm_source=flyer&utm_medium=qr`]);

    // A screen with a value in its address: Google gets its pattern only.
    await page.goto("/legal/privacy?lang=en");
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
    await expect
      .poll(async () => (await pageViews(page)).map((view) => view.page_title))
      .toEqual(["/legal/[type]"]);
    const [view] = await pageViews(page);
    expect(view?.page_location).toBe(`${origin}/legal/[type]`);
    await expect(question(page)).toBeHidden();
  });

  test("Decline loads nothing, and the answer is kept", async ({ page }) => {
    const asked = await siteWithAnalytics(page);
    await page.goto("/");
    await question(page).getByRole("button", { name: "Decline" }).click();
    await expect(question(page)).toBeHidden();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Where are you going?" })).toBeVisible();
    await expect(question(page)).toBeHidden();
    expect(asked).toEqual([]);
  });

  test("the Cookies page turns it off at once and removes Google's cookies", async ({
    page,
    context,
  }) => {
    const asked = await siteWithAnalytics(page);
    await page.goto("/cookies");
    const counting = page.getByRole("switch", { name: "Count my visits with Google Analytics" });
    await expect(counting).toHaveAttribute("aria-checked", "false");
    await counting.click();
    await expect(counting).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => asked.length).toBe(1);
    await expect(question(page)).toBeHidden();

    // As Google's tag would have set them.
    const origin = new URL(page.url());
    await context.addCookies(
      ["_ga", "_ga_TEST123456"].map((name) => ({
        name,
        value: "GA1.1.123.456",
        domain: origin.hostname,
        path: "/",
      })),
    );
    // Switching off reloads the page, so Google's tag is gone from it too.
    await Promise.all([page.waitForEvent("load"), counting.click()]);
    await expect(counting).toHaveAttribute("aria-checked", "false");
    expect(await page.evaluate(() => "dataLayer" in globalThis)).toBe(false);
    const names = (await context.cookies()).map((cookie) => cookie.name);
    expect(names).not.toContain("_ga");
    expect(names).not.toContain("_ga_TEST123456");
    expect(asked).toHaveLength(1);
  });
});
