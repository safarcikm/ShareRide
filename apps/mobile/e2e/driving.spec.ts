import { expect, test } from "@playwright/test";
import { english, menuLink, signUp } from "./support/account";
import { focused } from "./support/trips";

// Spec 3's first journey on the web build, against the test API: the car
// and licence live under Profile (spec 16, 3.4), and step 5 of posting asks
// for them when they are missing (post-a-trip.spec.ts).
test.describe("getting ready to drive on the web", () => {
  test.use({ locale: "en-GB" });

  test("a new driver adds a car and confirms their licence", async ({ page }) => {
    await signUp(page, english, "Anna");
    await menuLink(page, english.profileTab).click();
    await page.getByRole("link", { name: "My cars" }).click();
    await expect(page.getByRole("heading", { name: "My cars" })).toBeVisible();
    await expect(page.getByText("No cars yet. Add the car you drive.")).toBeVisible();

    // With no car yet, adding one is the page's main button, in the bar at
    // the bottom (spec 31, R31.1).
    const bar = page.getByTestId("bottom-bar").filter({ visible: true });
    await expect(bar.getByRole("button", { name: "Add a car" })).toBeInViewport();
    await bar.getByRole("button", { name: "Add a car" }).click();
    await expect(page.getByRole("heading", { name: "Add a car" })).toBeVisible();
    // So is the form's own button, seen before the form is filled in.
    await expect(bar.getByRole("button", { name: "Save car" })).toBeInViewport();
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
    await expect(page.getByRole("heading", { name: "My cars" })).toBeVisible();
    const car = page.getByRole("button", { name: /^Toyota Yaris, white/ });
    await expect(car).toContainText("No number plate yet");
    // With a car, another is a row under it, and the page has no bar.
    await expect(
      page.getByRole("button", { name: "Add a car" }).filter({ visible: true }),
    ).toBeVisible();
    await expect(bar).toHaveCount(0);

    // The plate, added later, comes back in capitals without the hyphen. It
    // has 8 characters, which Iceland does not issue, so it is not real.
    await car.click();
    await expect(page.getByRole("heading", { name: "Edit your car" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "White" })).toBeChecked();
    await page.getByLabel("Number plate", { exact: true }).fill("test-0001");
    await page.getByRole("button", { name: "Save car" }).click();
    await expect(car).toContainText("TEST0001");

    // Removing asks first, where the red row stood, and the question has
    // focus; keeping the car gives focus back to the row (spec 31, 3.19).
    await car.click();
    await page.getByRole("button", { name: "Remove car" }).click();
    await expect
      .poll(() => focused(page))
      .toContain("Remove Toyota Yaris? It stays on your past rides.");
    await page.getByRole("button", { name: "Keep it" }).click();
    await expect.poll(() => focused(page)).toContain("Remove car");
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(car).toContainText("TEST0001");

    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("link", { name: "Driving licence, Not confirmed yet" }).click();
    await expect(page.getByRole("heading", { name: "Your driving licence" })).toBeVisible();
    const declaration = page.getByRole("checkbox", {
      name: "I declare that I hold a valid driving licence for the cars I drive on PuffinRide",
    });
    await expect(bar.getByRole("button", { name: "Confirm", exact: true })).toBeInViewport();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Tick the box to confirm." }),
    ).toBeVisible();
    await declaration.press("Space");
    await expect(declaration).toBeChecked();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    const confirmed = page.getByRole("link", { name: "Driving licence, Confirmed" });
    await expect(confirmed).toBeVisible();

    await page.reload();
    await expect(confirmed).toBeVisible();
  });
});
