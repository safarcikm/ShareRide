import { expect, test } from "@playwright/test";

// Against the sample meeting points the e2e API seeds (packages/db/src/sample).
test.describe("meeting points on the web", () => {
  test.use({ locale: "en-GB" });

  test("lists the sample points by region and opens one", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "See the meeting points" }).click();
    await expect(page.getByRole("heading", { name: "Meeting points" })).toBeVisible();
    await expect(page.getByText(/These are sample meeting points/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Meeting points" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Capital area" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Northeast" })).toBeVisible();

    await page.getByRole("button", { name: /^Hof bus stop, Akureyri/ }).click();
    await expect(page.getByRole("heading", { name: "Hof bus stop, Akureyri" })).toBeVisible();
    await expect(page.getByText("Hof, Akureyri", { exact: true })).toBeVisible();
    await expect(page.getByText("In use all year")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open in maps" })).toBeVisible();
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
