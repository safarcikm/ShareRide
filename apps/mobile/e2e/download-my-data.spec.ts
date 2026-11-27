import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { english, signUp } from "./support/account";
import { confirmCodeSubject, emailedCode } from "./support/email";
import { filesIn } from "./support/zip";

// Download my data (spec 11, 3.2) on the web build: from Profile, ask with
// a fresh code sent by email, wait while the API makes the file, and
// download the ZIP through the one-time link and open both of its files.

test.use({ locale: "en-GB" });

test("downloads my data from Profile", async ({ page }) => {
  const { email } = await signUp(page, english, "Rósa");
  await page.goto("/profile");
  await page.getByRole("link", { name: "Privacy and your data" }).click();
  await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();
  await page.getByRole("button", { name: "Download my data" }).click();
  await expect(page.getByRole("heading", { name: "Download my data" })).toBeVisible();

  const code = await emailedCode(email, confirmCodeSubject, () =>
    page.getByRole("button", { name: "Make my file" }).click(),
  );
  // The address shows partly hidden (spec 26, 3.6).
  await expect(
    page.getByText(`We emailed a code to ${email.slice(0, 2)}•••@example.com.`),
  ).toBeVisible();
  await page.getByLabel("6-digit code").fill(code);

  // The test API builds files every second; the screen looks every 5 seconds.
  await expect(page.getByRole("button", { name: "Download the file" })).toBeVisible({
    timeout: 20_000,
  });
  // Shown, and read out by screen readers through the page's live region.
  await expect(page.getByText(/^Your file is ready\. You can download it until /)).toHaveCount(2);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download the file" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^puffinride-data-\d{4}-\d{2}-\d{2}\.zip$/);

  // Both files open: the data for programs, and the page to read.
  const files = filesIn(readFileSync(await download.path()));
  expect([...files.keys()].sort()).toEqual(["puffinride-data.html", "puffinride-data.json"]);
  const data = JSON.parse(files.get("puffinride-data.json") ?? "") as {
    readonly format: string;
    readonly sections: { readonly account: { readonly firstName: string } };
  };
  expect(data.format).toBe("shareride-export");
  expect(data.sections.account.firstName).toBe("Rósa");
  const html = files.get("puffinride-data.html") ?? "";
  expect(html).toContain("<h1>");
  expect(html).toContain("Rósa");
  expect(html).not.toContain("<script");
});
