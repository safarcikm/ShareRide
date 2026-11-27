import { expect, test } from "@playwright/test";
import { apiUrl } from "../playwright.config";
import { english, signUp } from "./support/account";
import { focused } from "./support/trips";

// Spec 12's feedback on the web build: a tester sends feedback from
// Profile (a browser takes no screenshot), reads it back under My
// feedback, PuffinRide replies (the test API does what the console does), and
// the reply shows there.

test.use({ locale: "en-GB" });

const message = "The search results take a while to show on my laptop.";
const reply = "Thank you. We found the cause and it will be faster next week.";

test("a tester sends feedback and reads PuffinRide's reply", async ({ page }) => {
  test.slow();
  const visible = { visible: true } as const;
  const { phone } = await signUp(page, english, "Ari");

  await page.goto("/profile");
  await page.getByRole("button", { name: "Send feedback", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Send feedback" })).toBeVisible();
  // No picture of the screen from a browser.
  await expect(page.getByText("Remove the screenshot")).toHaveCount(0);

  // It asks what it is about, and for a message.
  await page.getByRole("button", { name: "Send feedback", exact: true }).click();
  await expect(page.getByText("Choose what it is about.").filter(visible)).toBeVisible();
  await page.getByRole("radio", { name: "Something isn't working" }).click();
  await page.getByLabel("Your message").fill(message);
  await page.getByRole("button", { name: "Send feedback", exact: true }).click();
  // The thanks are the page's title now, with where an answer will show
  // under them, and they have focus: the button pressed is gone (spec 31,
  // 3.19).
  await expect(
    page.getByRole("heading", { name: "Thank you. We got your feedback." }),
  ).toBeVisible();
  await expect.poll(() => focused(page)).toContain("Thank you. We got your feedback.");
  expect(await focused(page)).toContain("If we reply, you'll see it under My feedback in Profile.");
  // The way on is the main button, in the bar.
  const bar = page.getByTestId("bottom-bar").filter(visible);
  await expect(bar.getByRole("button", { name: "Done" })).toBeInViewport();

  await page.getByRole("button", { name: "My feedback" }).click();
  await expect(page.getByRole("heading", { name: "My feedback" })).toBeVisible();
  await expect(page.getByText(message).filter(visible)).toBeVisible();
  await expect(page.getByText("No reply yet.").filter(visible)).toBeVisible();

  const replied = await page.request.post(`${apiUrl}/e2e/feedback-reply`, {
    data: { phone: phone.e164, reply },
  });
  expect(replied.ok()).toBe(true);

  await page.reload();
  await expect(page.getByText(reply).filter(visible)).toBeVisible();
  await expect(page.getByText("No reply yet.")).toHaveCount(0);
});
