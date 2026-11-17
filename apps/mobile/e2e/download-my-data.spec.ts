import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { english, signUp } from "./support/account";
import { codeIn, sentCount, textMessage } from "./support/sms";
import { filesIn } from "./support/zip";

// Download my data (spec 11, 3.2) on the web build: from Settings, ask with
// a fresh code sent by text message, wait while the API makes the file, and
// download the ZIP through the one-time link and open both of its files.

test.use({ locale: "en-GB" });

test("downloads my data from Settings", async ({ page }) => {
  const { phone } = await signUp(page, english, "Rósa");
  await page.goto("/settings");
  await page.getByRole("button", { name: "Privacy and your data" }).click();
  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
  await page.getByRole("button", { name: "Download my data" }).click();
  await expect(page.getByRole("heading", { name: "Download my data" })).toBeVisible();

  const sentBefore = sentCount(phone.e164);
  await page.getByRole("button", { name: "Make my file" }).click();
  const text = await textMessage(phone.e164, sentBefore + 1);
  await expect(
    page.getByText(
      `We sent a code by text message to your number ending in ${phone.e164.slice(-2)}.`,
    ),
  ).toBeVisible();
  await page.getByLabel("6-digit code").fill(codeIn(text));

  // The test API builds files every second; the screen looks every 5 seconds.
  await expect(page.getByRole("button", { name: "Download the file" })).toBeVisible({
    timeout: 20_000,
  });
  // Shown, and read out by screen readers through the page's live region.
  await expect(page.getByText(/^Your file is ready\. You can download it until /)).toHaveCount(2);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download the file" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^shareride-data-\d{4}-\d{2}-\d{2}\.zip$/);

  // Both files open: the data for programs, and the page to read.
  const files = filesIn(readFileSync(await download.path()));
  expect([...files.keys()].sort()).toEqual(["shareride-data.html", "shareride-data.json"]);
  const data = JSON.parse(files.get("shareride-data.json") ?? "") as {
    readonly format: string;
    readonly sections: { readonly account: { readonly firstName: string } };
  };
  expect(data.format).toBe("shareride-export");
  expect(data.sections.account.firstName).toBe("Rósa");
  const html = files.get("shareride-data.html") ?? "";
  expect(html).toContain("<h1>");
  expect(html).toContain("Rósa");
  expect(html).not.toContain("<script");
});
