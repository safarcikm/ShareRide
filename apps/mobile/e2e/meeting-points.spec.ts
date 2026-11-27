import { expect, test, type Page } from "@playwright/test";
import { mapSize, project, type Position } from "@shareride/ui/map";
import { english, enterCodes, finishSignUp } from "./support/account";
import { newPhoneNumber } from "./support/sms";
import { focused } from "./support/trips";

/** Phones show the map first and the list on a choice; wide screens show both. */
async function showList(page: Page) {
  if (test.info().project.name === "phone") {
    await page.getByRole("radio", { name: "List" }).click();
  }
}

/** Clicks the map of the whole of Iceland where a position is. */
async function clickMapAt(page: Page, position: Position) {
  const area = await page.getByTestId("map-touch").boundingBox();
  if (area === null) throw new Error("The map is not on the page.");
  const { x, y } = project(position);
  await page.mouse.click(
    area.x + (x / mapSize.width) * area.width,
    area.y + (y / mapSize.height) * area.height,
  );
}

// Against the sample meeting points the e2e API seeds (packages/db/src/sample).
test.describe("meeting points on the web", () => {
  test.use({ locale: "en-GB" });

  test("lists the sample points by region and opens one", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "See the meeting points" }).click();
    await expect(page.getByRole("heading", { name: "Meeting points" })).toBeVisible();
    await expect(page.getByText(/These are sample meeting points/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Meeting points" })).toBeVisible();
    await showList(page);
    await expect(page.getByRole("heading", { level: 2, name: "Capital area" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Northeast" })).toBeVisible();

    await page.getByRole("link", { name: /^Hof bus stop, Akureyri/ }).click();
    await expect(page.getByRole("heading", { name: "Hof bus stop, Akureyri" })).toBeVisible();
    await expect(page.getByText("Hof, Akureyri", { exact: true })).toBeVisible();
    await expect(page.getByText("In use all year")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open in maps" })).toBeVisible();
  });

  test("shows the points on a map, and opens one from it", async ({ page }) => {
    await page.goto("/meeting-points");
    const map = page.getByTestId("points-map");
    await expect(
      map.getByRole("img", { name: /^Map of Iceland with \d+ meeting points/ }),
    ).toBeVisible();

    // Hof bus stop and Akureyri Airport are 3 km apart: one spot on the map.
    await clickMapAt(page, { latitude: 65.6832, longitude: -18.0871 });
    await expect(map.getByRole("link", { name: /^Hof bus stop, Akureyri/ })).toBeVisible();
    await expect(map.getByRole("link", { name: /^Akureyri Airport/ })).toBeVisible();

    // N1 Vík is on its own: a second click opens it.
    const vik = { latitude: 63.4191, longitude: -19.0061 };
    await clickMapAt(page, vik);
    await expect(map.getByRole("link", { name: /^N1 Vík/ })).toBeVisible();
    await expect(map.getByRole("link", { name: /^Akureyri Airport/ })).toBeHidden();
    await clickMapAt(page, vik);
    await expect(page.getByRole("heading", { name: "N1 Vík" })).toBeVisible();
    await expect(page.getByRole("img", { name: "N1 Vík on a map of Iceland" })).toBeVisible();
  });

  test("keeps the map and the points of a crowded spot within the window", async ({ page }) => {
    test.skip(
      test.info().project.name !== "desktop",
      "Only wide screens show the map beside the list",
    );
    await page.goto("/meeting-points");
    // The capital area's sample points share one spot on the map.
    await clickMapAt(page, { latitude: 64.1374, longitude: -21.9356 });
    const cards = page.getByTestId("points-map").getByRole("link");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(4);

    const aside = await page.getByTestId("aside").boundingBox();
    const window = page.viewportSize();
    expect(aside !== null && window !== null && aside.y + aside.height <= window.height).toBe(true);
    await cards.last().scrollIntoViewIfNeeded();
    await expect(cards.last()).toBeInViewport();
  });

  test("finds a town typed without Icelandic letters, with its nearest points", async ({
    page,
  }) => {
    await page.goto("/meeting-points");
    await page.getByLabel("Town or meeting point").fill("thorlakshofn");
    await page.getByRole("button", { name: /^Þorlákshöfn, Town/ }).click();
    await expect(page.getByRole("heading", { name: "Þorlákshöfn" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nearest meeting points" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^N1 Þorlákshöfn, .* away/ })).toBeVisible();
  });

  test("tolerates a typo and finds the airport by its code", async ({ page }) => {
    await page.goto("/meeting-points");
    const field = page.getByLabel("Town or meeting point");
    await field.fill("Akureyi");
    await expect(page.getByRole("button", { name: /^Akureyri, Town/ })).toBeVisible();

    await field.fill("KEF");
    await page.getByRole("button", { name: /^Keflavík Airport/ }).click();
    await expect(page.getByText(/^Also known as .*KEF/)).toBeVisible();
  });

  // "Something wrong here?" (spec 2, 3.5): signed out, it asks to sign in,
  // and after signing up the form opens again for the same point.
  test("reports a problem with a point after signing up", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "See the meeting points" }).click();
    await showList(page);
    await page.getByRole("link", { name: /^N1 Vík/ }).click();
    await expect(page.getByRole("heading", { name: "N1 Vík" })).toBeVisible();
    await page.getByRole("button", { name: "Something wrong here?" }).click();
    await expect(
      page.getByRole("heading", { name: "Sign in to tell us what's wrong" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await enterCodes(page, english, newPhoneNumber());
    await finishSignUp(page, english, "Freyja");

    await expect(page.getByRole("heading", { name: "What's wrong here?" })).toBeVisible();
    // Send is the page's one main button, in the bar at the bottom (spec 31, R31.1).
    const bar = page.getByTestId("bottom-bar").filter({ visible: true });
    await expect(bar.getByRole("button", { name: "Send", exact: true })).toBeInViewport();
    await page.getByRole("button", { name: "Send", exact: true }).click();
    // Why it did nothing is said over it, whatever of the page is in sight.
    await expect(bar.getByText("Choose what is wrong.")).toBeInViewport();
    await page.getByRole("radio", { name: "It's in the wrong place on the map" }).click();
    await page
      .getByRole("textbox", { name: "Tell us more (optional)" })
      .fill("The pin is across the road.");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    // The thanks are the page's title, with focus, and the way back is the
    // bar's button (3.19).
    const thanks = "Thank you. We'll check this meeting point.";
    await expect(page.getByRole("heading", { name: thanks })).toBeVisible();
    await expect.poll(() => focused(page)).toContain(thanks);
    await expect(bar.getByRole("button", { name: "Back", exact: true })).toBeInViewport();
  });
});
