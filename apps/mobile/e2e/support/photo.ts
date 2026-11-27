import { expect, type Page } from "@playwright/test";

/** A landscape picture, 900 by 600 pixels, as the browser itself writes a JPEG. */
export async function landscapeJpeg(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 600;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("No canvas.");
    context.fillStyle = "#2f6b4f";
    context.fillRect(0, 0, 900, 600);
    context.fillStyle = "#eef3f4";
    context.fillRect(300, 150, 300, 300);
    return canvas.toDataURL("image/jpeg", 0.9);
  });
  return Buffer.from(dataUrl.replace(/^data:image\/jpeg;base64,/, ""), "base64");
}

/** The words of adding a photo before publishing, in the journey's language. */
export interface PhotoTexts {
  /** Step 5's title. */
  readonly reviewTitle: string;
  readonly addPhoto: string;
  readonly photoTitle: string;
}

export const englishPhoto: PhotoTexts = {
  reviewTitle: "Check and publish",
  addPhoto: "Add a photo",
  photoTitle: "Your profile photo",
};

/**
 * The screen with this title, not one left in the page under it: its page
 * and the bar at its bottom, where its main button is (spec 31, R31.1).
 */
const screenTitled = (page: Page, title: string) =>
  page
    .getByTestId("screen-safe-area")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });

/**
 * From step 5 of posting a trip: Add a photo, a picture from a file, and
 * back on step 5 once the API has stored it.
 */
export async function addPhotoBeforePublishing(
  page: Page,
  texts: PhotoTexts = englishPhoto,
): Promise<void> {
  await screenTitled(page, texts.reviewTitle).getByRole("button", { name: texts.addPhoto }).click();
  // Step 5 stays in the page under it, with its own Add a photo.
  const screen = screenTitled(page, texts.photoTitle);
  await expect(screen).toBeVisible();
  const picture = await landscapeJpeg(page);
  const chooser = page.waitForEvent("filechooser");
  const stored = page.waitForResponse(
    (response) => response.url().endsWith("/v1/me/photo") && response.request().method() === "PUT",
  );
  // The photo page's one main button, in its bar.
  await screen.getByTestId("bottom-bar").getByRole("button", { name: texts.addPhoto }).click();
  await (await chooser).setFiles({ name: "me.jpg", mimeType: "image/jpeg", buffer: picture });
  expect((await stored).status()).toBe(200);
  await expect(screen).toBeHidden();
}
