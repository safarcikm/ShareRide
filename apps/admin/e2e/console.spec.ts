import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { operatorLink } from "../playwright.config.ts";
import { addAuthenticator } from "./passkeys.ts";

// One operator, one browser tab and its passkeys, through the journeys in
// order: the setup link works once, so the later journeys go on signed in.
test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;
let device: Awaited<ReturnType<typeof addAuthenticator>>;

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext();
  page = await context.newPage();
  device = await addAuthenticator(page);
});

test.afterAll(async () => {
  await context.close();
});

// The operator's first visit (ADR 0028): the setup link saves a passkey,
// the operator signs out and back in with it, adds a second device's
// passkey, removes the first, signs in with the second, and finds each step
// in the audit log.
test("the operator saves a passkey with the setup link, adds another and signs in with it", async () => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Sign in to the console" })).toBeVisible();
  await expect(page).toHaveTitle("ShareRide console");

  // The link from the operator command; the page takes the token out of the address.
  await page.goto(readFileSync(operatorLink, "utf8").trim());
  await expect(page.getByRole("heading", { name: "Save your passkey" })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/setup$/);
  await page.getByRole("button", { name: "Save the passkey" }).click();
  await expect(page.getByText("Give the passkey a name.")).toBeVisible();
  await page.getByLabel("Name of this passkey").fill("Laptop");
  await page.getByRole("button", { name: "Save the passkey" }).click();
  await expect(page.getByRole("heading", { name: "Welcome, Operator" })).toBeVisible();

  const menu = page.getByRole("navigation", { name: "Console menu" });
  await menu.getByRole("link", { name: "Passkeys" }).click();
  await expect(page.getByRole("heading", { name: "Passkeys" })).toBeVisible();
  await expect(page.getByText("Laptop")).toBeVisible();

  // A reload keeps the session and the page.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Passkeys" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText("You signed out.")).toBeVisible();
  await page.goto("/admin/passkeys");
  await expect(page.getByRole("heading", { name: "Sign in to the console" })).toBeVisible();

  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page.getByRole("heading", { name: "Passkeys" })).toBeVisible();
  await expect(page.getByText("Add another passkey before you remove this one.")).toBeVisible();

  // A second device: signing in just now confirmed it is the operator.
  await device.switchDevice();
  await page.getByLabel("Name of this passkey").fill("Phone");
  await page.getByRole("button", { name: "Add the passkey" }).click();
  await expect(page.getByRole("status")).toHaveText("Phone was added.");
  await page.getByRole("button", { name: "Remove Laptop" }).click();
  await page.getByRole("button", { name: "Remove Laptop" }).click();
  await expect(page.getByRole("status")).toHaveText("Laptop was removed.");
  await expect(page.getByRole("listitem").filter({ hasText: "Laptop" })).toBeHidden();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page.getByRole("heading", { name: "Passkeys" })).toBeVisible();
  await expect(page.getByText("Phone")).toBeVisible();

  // Every step is in the audit log, newest first, and the filters stay in the address.
  await menu.getByRole("link", { name: "Audit log" }).click();
  const entries = page.getByRole("list", { name: "Entries" }).getByRole("listitem");
  await expect(entries.first()).toContainText("operator.signed_in");
  await expect(entries.filter({ hasText: "operator.role_given" })).toContainText(
    "With the operator command",
  );
  await page.getByLabel("Action starts with").fill("operator.passkey.");
  await page.getByRole("button", { name: "Show entries" }).click();
  await expect(page).toHaveURL(/\/admin\/audit-log\?action=operator\.passkey\.$/);
  await expect(entries).toHaveCount(3);
  await expect(entries.first()).toContainText("operator.passkey.removed");
  await page.reload();
  await expect(page.getByLabel("Action starts with")).toHaveValue("operator.passkey.");
  await expect(entries).toHaveCount(3);

  // On a phone the log fits the width.
  await page.setViewportSize({ width: 390, height: 844 });
  await entries.first().getByText("Details").click();
  await expect(entries.first().getByRole("table", { name: "Changes" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // On a phone the menu folds behind a button.
  await expect(menu.getByRole("link", { name: "Home" })).toBeHidden();
  await page.getByRole("button", { name: "Menu" }).click();
  await menu.getByRole("link", { name: "Home" }).click();
  await expect(page.getByRole("heading", { name: "Welcome, Operator" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Home" })).toBeHidden();
});

// A new meeting point (spec 2, 3.6.2): the form names what is missing, reads
// a pasted map link and shows the spot, saves a draft, and the draft is in
// the list. An edit saved in another tab first is not overwritten. Each
// save is in the audit log.
test("the operator adds a meeting point as a draft, finds it and edits it", async () => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const menu = page.getByRole("navigation", { name: "Console menu" });
  await menu.getByRole("link", { name: "Meeting points" }).click();
  await expect(page.getByRole("heading", { name: "Meeting points", level: 1 })).toBeVisible();
  const points = page.getByRole("list", { name: "The meeting points" }).getByRole("listitem");
  await expect(points.filter({ hasText: "BSÍ" })).toContainText("Sample");

  await page.getByRole("link", { name: "Add a meeting point" }).click();
  await expect(page.getByRole("heading", { name: "New meeting point", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Save the draft" }).click();
  const problems = page.getByRole("alert");
  await expect(problems).toBeFocused();
  await expect(problems).toContainText("Fix 5 fields to save:");
  await page.getByRole("link", { name: "Icelandic name: Fill this in." }).click();
  await expect(page.getByLabel("Icelandic name")).toBeFocused();

  await page.getByLabel("Icelandic name").fill("Prófunarstaður við Hveragerði");
  await expect(page.getByLabel("Icelandic name")).toHaveAttribute("aria-invalid", "false");
  await page
    .getByLabel("Coordinates or a map link")
    .fill("https://www.openstreetmap.org/?mlat=63.99938&mlon=-21.18525#map=17/63.99938/-21.18525");
  await expect(page.getByText("Reads as 63.99938, -21.18525")).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Prófunarstaður við Hveragerði on a map of Iceland" }),
  ).toBeVisible();
  await page.getByLabel("Region").selectOption("south");
  await page.getByLabel("Municipality").fill("Hveragerðisbær");
  await page.getByLabel("Type").selectOption("fuel-station");
  await page.getByLabel("Toilets").check();
  await page.getByLabel("I have checked the amenities").check();
  await page.getByRole("button", { name: "Save the draft" }).click();
  await expect(page.getByText("Prófunarstaður við Hveragerði is saved as a draft.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/meeting-points\/[0-9a-f-]{36}$/);
  const address = page.url();

  // A reload opens the saved draft.
  await page.reload();
  await expect(page.getByText("Status: Draft")).toBeVisible();
  await expect(page.getByLabel("Municipality")).toHaveValue("Hveragerðisbær");
  await expect(page.getByLabel("Toilets")).toBeChecked();

  // Someone saves the point in another tab after this one opened it.
  const other = await context.newPage();
  await other.goto(address);
  await other.getByLabel("English name, if different").fill("Test spot near Hveragerði");
  await other.getByRole("button", { name: "Save the changes" }).click();
  await expect(other.getByText("The changes are saved.")).toBeVisible();
  await other.close();

  await page.getByLabel("Where to stand, in Icelandic").fill("Við dælurnar.");
  await page.getByRole("button", { name: "Save the changes" }).click();
  await expect(page.getByText(/saved somewhere else after you opened it/)).toBeVisible();
  await page.getByRole("button", { name: "Load the newest copy" }).click();
  await expect(page.getByLabel("English name, if different")).toHaveValue(
    "Test spot near Hveragerði",
  );
  await page.getByLabel("Where to stand, in Icelandic").fill("Við dælurnar.");
  await page.getByRole("button", { name: "Save the changes" }).click();
  await expect(page.getByText("The changes are saved.")).toBeVisible();

  // The draft is in the list, found by its name, with the filters in the address.
  await page.getByRole("link", { name: "All meeting points" }).click();
  await page.getByLabel("Name").fill("prófunarstaður");
  await page.getByLabel("Status").selectOption("draft");
  await page.getByRole("button", { name: "Show meeting points" }).click();
  await expect(page).toHaveURL(/\/admin\/meeting-points\?status=draft&q=pr%C3%B3funarsta%C3%B0ur$/);
  await expect(page.getByText("1 meeting point", { exact: true })).toBeVisible();
  await expect(points).toHaveCount(1);
  await expect(points.first()).toContainText("Draft");
  await expect(points.first()).toContainText("Fuel station");

  // On a phone the list and the form fit the width.
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await points.first().getByRole("link", { name: "Prófunarstaður við Hveragerði" }).click();
  await expect(page.getByLabel("Where to stand, in Icelandic")).toHaveValue("Við dælurnar.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // Each save is in the audit log, with only the fields it changed.
  await page.goto("/admin/audit-log?action=meeting_point.");
  const entries = page.getByRole("list", { name: "Entries" }).getByRole("listitem");
  await expect(entries).toHaveCount(3);
  await expect(entries.nth(0)).toContainText("meeting_point.updated");
  await expect(entries.nth(2)).toContainText("meeting_point.created");
});

// Pausing, bringing back and retiring (spec 2, 3.6.4 and 3.6.5): a pause
// needs its reason in both languages, a retirement asks first, and each
// change is in the audit log.
test("the operator pauses a meeting point, brings it back and retires a draft", async () => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const inUse = page.getByRole("region", { name: "In use" });
  await page.goto("/admin/meeting-points");
  await page.getByRole("link", { name: "BSÍ", exact: true }).click();
  await expect(page.getByText("Status: Active")).toBeVisible();

  await inUse.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByLabel("Reason, in Icelandic")).toBeFocused();
  await page.getByRole("button", { name: "Pause BSÍ" }).click();
  await expect(inUse.getByText("Fill this in.")).toHaveCount(2);
  await expect(page.getByLabel("Reason, in Icelandic")).toBeFocused();
  await page.getByLabel("Reason, in Icelandic").fill("Vegavinna við stöðina.");
  await page.getByLabel("Reason, in English").fill("Road works at the terminal.");
  await page.getByRole("button", { name: "Pause BSÍ" }).click();
  await expect(page.getByText("BSÍ is paused.")).toBeFocused();
  await expect(page.getByText("Status: Paused")).toBeVisible();
  await expect(inUse).toContainText("Road works at the terminal.");
  await expect(inUse).toContainText("Paused until you bring it back.");

  await inUse.getByRole("button", { name: "Bring it back into use" }).click();
  await expect(page.getByText("BSÍ is back in use.")).toBeFocused();
  await expect(page.getByText("Status: Active")).toBeVisible();

  // The draft added before retires at once: no trip stops there.
  await page.getByRole("link", { name: "All meeting points" }).click();
  await page.getByRole("link", { name: "Prófunarstaður við Hveragerði" }).click();
  await inUse.getByRole("button", { name: "Retire" }).click();
  await expect(inUse).toContainText("It is retired at once. Retiring is for good.");
  await page.getByRole("button", { name: "Keep it" }).click();
  await expect(inUse.getByRole("button", { name: "Retire" })).toBeFocused();
  await inUse.getByRole("button", { name: "Retire" }).click();
  await page.getByRole("button", { name: "Retire Prófunarstaður við Hveragerði" }).click();
  await expect(page.getByText("Prófunarstaður við Hveragerði is retired.")).toBeFocused();
  await expect(page.getByLabel("Icelandic name")).toBeDisabled();
  await expect(inUse).toHaveCount(0);

  await page.goto("/admin/audit-log?action=meeting_point.");
  const entries = page.getByRole("list", { name: "Entries" }).getByRole("listitem");
  await expect(entries.nth(0)).toContainText("meeting_point.retired");
  await expect(entries.nth(1)).toContainText("meeting_point.resumed");
  await expect(entries.nth(2)).toContainText("meeting_point.paused");
});

// Reports (spec 9, 3.4): two sample drivers' trips are reported. The
// operator closes one without action, suspends the other driver from their
// report after reading the notice as she will, and closes that one too.
// Each step is in the audit log.
test("the operator closes one report and suspends from another", async ({ request }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const file = async (data: Record<string, string>) => {
    const response = await request.post("/e2e/report", { data });
    expect(response.status()).toBe(201);
  };
  await file({
    by: "Jón",
    tripOf: "Sigga",
    category: "other",
    description: "Test: the price looked too high.",
  });
  await file({
    by: "Jón",
    tripOf: "Anna",
    category: "safety",
    description: "Test: she drove far too fast last time.",
  });

  const menu = page.getByRole("navigation", { name: "Console menu" });
  await menu.getByRole("link", { name: "Reports" }).click();
  await expect(page.getByRole("heading", { name: "Reports", level: 1 })).toBeVisible();
  const open = page.getByRole("list", { name: "Open reports" }).getByRole("listitem");
  await expect(open).toHaveCount(2);
  // Safety first.
  await expect(open.nth(0)).toContainText("Reported by Jón · About Anna");
  await expect(open.nth(1)).toContainText("Reported by Jón · About Sigga");

  // Nothing broke the rules: closed, and the reporter is told.
  await open.nth(1).getByRole("link", { name: "A trip: Something else" }).click();
  await expect(page.getByRole("region", { name: "The report", exact: true })).toContainText(
    "Test: the price looked too high.",
  );
  await expect(page.getByRole("button", { name: "Show the conversation" })).toHaveCount(0);
  const close = page.getByRole("region", { name: "Close the report" });
  await close.getByRole("radio", { name: "No breach" }).check();
  await close.getByRole("button", { name: "Close the report" }).click();
  await expect(close.getByRole("button", { name: "Yes, close it" })).toBeFocused();
  await close.getByRole("button", { name: "Yes, close it" }).click();
  await expect(close.getByRole("status")).toHaveText("Closed. The reporter is told.");

  // A suspension, read first as Anna reads it, in Icelandic.
  await page.getByRole("link", { name: "All reports" }).click();
  await expect(open).toHaveCount(1);
  await open
    .first()
    .getByRole("link", { name: "A trip: Safety: dangerous driving, threats or violence" })
    .click();
  const reported = page.getByRole("region", { name: "The person reported: Anna" });
  await expect(reported).toContainText("Drove");
  const act = page.getByRole("region", { name: "Act on it" });
  await act.getByRole("radio", { name: "Suspend Anna" }).check();
  await act.getByRole("combobox", { name: "Community rule" }).selectOption("safety");
  await act.getByRole("textbox", { name: "Reason, written for Anna" }).fill("Of hraður akstur.");
  await act.getByRole("checkbox", { name: "No end date" }).check();
  await act.getByRole("button", { name: "Review the notice" }).click();
  const preview = act.getByRole("group", { name: "What Anna reads, in Icelandic" });
  await expect(preview).toContainText("Of hraður akstur.");
  await preview.getByRole("button", { name: "Send" }).click();
  await expect(act.getByRole("status")).toHaveText(
    /^Suspended\. \d+ trips? and no bookings cancelled\. Anna is told why\.$/,
  );
  await expect(page.getByRole("region", { name: "Actions on this report" })).toContainText(
    "Suspension",
  );
  await expect(reported).toContainText("Suspended with no end date");

  await close.getByRole("radio", { name: "Action taken" }).check();
  await close.getByRole("button", { name: "Close the report" }).click();
  await close.getByRole("button", { name: "Yes, close it" }).click();
  await expect(close.getByRole("status")).toHaveText("Closed. The reporter is told.");

  // Both are closed, with their outcomes; on a phone the page fits the width.
  await page.getByRole("link", { name: "All reports" }).click();
  await expect(page.getByText("No report is open.")).toBeVisible();
  await page.getByRole("link", { name: "Closed", exact: true }).click();
  const closed = page.getByRole("list", { name: "Closed reports" }).getByRole("listitem");
  await expect(closed).toHaveCount(2);
  await expect(closed.filter({ hasText: "About Anna" })).toContainText("Action taken");
  await expect(closed.filter({ hasText: "About Sigga" })).toContainText("No breach");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await page.goto("/admin/audit-log?action=report.");
  const entries = page.getByRole("list", { name: "Entries" }).getByRole("listitem");
  await expect(entries).toHaveCount(2);
  await page.goto("/admin/audit-log?action=user.suspended");
  await expect(entries).toHaveCount(1);
});
