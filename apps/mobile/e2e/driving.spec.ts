import { expect, test } from "@playwright/test";
import { english, signUp } from "./support/account";

// Spec 3's first journey on the web build, against the test API.
test.describe("getting ready to drive on the web", () => {
  test.use({ locale: "en-GB" });

  test("a new driver adds a car and confirms their licence", async ({ page }) => {
    await signUp(page, english, "Anna");
    await page.getByRole("button", { name: "Offer a ride" }).click();
    await expect(page.getByRole("heading", { name: "Before you publish" })).toBeVisible();
    // Screen readers on the web hear whether each item is done, not only see the box.
    await expect(page.getByTestId("readiness-car")).toContainText("A car: Not done yet");

    await page.getByRole("button", { name: "Add a car" }).click();
    await expect(page.getByRole("heading", { name: "Add a car" })).toBeVisible();
    await page.getByLabel("Make").fill("toy");
    await page.getByRole("button", { name: "Toyota" }).click();
    await page.getByLabel("Model").fill("Yaris");
    // Space picks a colour, as on any web page.
    await page.getByRole("radio", { name: "White" }).press("Space");
    await expect(page.getByRole("radio", { name: "White" })).toBeChecked();
    await expect(page.getByLabel("Number plate", { exact: true })).toHaveAccessibleDescription(
      /Only passengers who book see it/,
    );
    await page.getByRole("button", { name: "Save car" }).click();
    await expect(page.getByRole("heading", { name: "Your cars" })).toBeVisible();
    await expect(page.getByText("Toyota Yaris, white")).toBeVisible();
    await expect(page.getByText("No number plate yet")).toBeVisible();
    await expect(page.getByTestId("readiness-car")).toContainText("A car: Done");

    await page.getByRole("button", { name: "Confirm your licence" }).click();
    await expect(page.getByRole("heading", { name: "Your driving licence" })).toBeVisible();
    const declaration = page.getByRole("checkbox", {
      name: "I declare that I hold a valid driving licence for the cars I drive on ShareRide",
    });
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Tick the box to confirm." }),
    ).toBeVisible();
    await declaration.press("Space");
    await expect(declaration).toBeChecked();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByText("Everything is ready for your first trip.")).toBeVisible();
    await expect(page.getByText(/^Confirmed on /)).toBeVisible();

    // The plate, added later, comes back in capitals without the hyphen. It
    // has 8 characters, which Iceland does not issue, so it is not real.
    await page.getByRole("button", { name: /^Toyota Yaris, white/ }).click();
    await expect(page.getByRole("heading", { name: "Edit your car" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "White" })).toBeChecked();
    await page.getByLabel("Number plate", { exact: true }).fill("test-0001");
    await page.getByRole("button", { name: "Save car" }).click();
    await expect(page.getByText("TEST0001", { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByText("Everything is ready for your first trip.")).toBeVisible();
  });
});
