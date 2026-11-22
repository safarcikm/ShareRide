import { expect, test } from "@playwright/test";
import { english, signUp } from "./support/account";
import { landscapeJpeg } from "./support/photo";

// A profile photo on the web build (spec 1, 3.5; ADR 0033): a member picks
// a picture from a file, the browser crops it square and writes it as a
// JPEG, the test API stores it in its photo folder, and Profile shows it.
// Then the member removes it.

test.use({ locale: "en-GB" });

const visible = { visible: true } as const;

test("a member adds a profile photo from a file, sees it on Profile, and removes it", async ({
  page,
}) => {
  test.slow();
  await signUp(page, english, "Ari");
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "My profile" })).toBeVisible();
  // A browser has no camera button: its file chooser offers one where there is a camera.
  await expect(page.getByRole("button", { name: "Take a photo" })).toHaveCount(0);

  const picture = await landscapeJpeg(page);
  const chooser = page.waitForEvent("filechooser");
  const stored = page.waitForResponse(
    (response) => response.url().endsWith("/v1/me/photo") && response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "Add a photo" }).click();
  await (await chooser).setFiles({ name: "me.jpg", mimeType: "image/jpeg", buffer: picture });
  expect((await stored).status()).toBe(200);
  await expect(page.getByText("Photo saved.").filter(visible)).toBeVisible();

  // The avatar shows the file the API keeps, in place of the letter.
  const shown = page.waitForResponse((response) => response.url().includes("/v1/photo-files/"));
  await page.reload();
  expect((await shown).status()).toBe(200);
  await expect(page.getByTestId("avatar-photo").filter(visible)).toBeVisible();
  await expect(page.getByRole("button", { name: "Change photo" })).toBeVisible();

  await page.getByRole("button", { name: "Remove photo" }).click();
  await expect(page.getByText("Photo removed.").filter(visible)).toBeVisible();
  await expect(page.getByTestId("avatar-photo")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add a photo" })).toBeVisible();
});
