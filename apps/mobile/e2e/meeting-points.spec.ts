import { expect, test, type Page } from "@playwright/test";
import { mapSize, project, type Position } from "@shareride/ui/map";

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
    await page.getByRole("button", { name: "See the meeting points" }).click();
    await expect(page.getByRole("heading", { name: "Meeting points" })).toBeVisible();
    await expect(page.getByText(/These are sample meeting points/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Meeting points" })).toBeVisible();
    await showList(page);
    await expect(page.getByRole("heading", { level: 2, name: "Capital area" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Northeast" })).toBeVisible();

    await page.getByRole("button", { name: /^Hof bus stop, Akureyri/ }).click();
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
    await expect(map.getByRole("button", { name: /^Hof bus stop, Akureyri/ })).toBeVisible();
    await expect(map.getByRole("button", { name: /^Akureyri Airport/ })).toBeVisible();

    // N1 Vík is on its own: a second click opens it.
    const vik = { latitude: 63.4191, longitude: -19.0061 };
    await clickMapAt(page, vik);
    await expect(map.getByRole("button", { name: /^N1 Vík/ })).toBeVisible();
    await expect(map.getByRole("button", { name: /^Akureyri Airport/ })).toBeHidden();
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
    const cards = page.getByTestId("points-map").getByRole("button");
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
    await expect(page.getByRole("button", { name: /^N1 Þorlákshöfn, .* away/ })).toBeVisible();
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
});
