import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { operatorLink } from "../playwright.config.ts";
import { addAuthenticator } from "./passkeys.ts";

// The operator's first visit (ADR 0028): the setup link saves a passkey,
// the operator signs out and back in with it, adds a second device's
// passkey, removes the first, and signs in with the second.
test("the operator saves a passkey with the setup link, adds another and signs in with it", async ({
  page,
}) => {
  const device = await addAuthenticator(page);

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

  // On a phone the menu folds behind a button.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(menu.getByRole("link", { name: "Home" })).toBeHidden();
  await page.getByRole("button", { name: "Menu" }).click();
  await menu.getByRole("link", { name: "Home" }).click();
  await expect(page.getByRole("heading", { name: "Welcome, Operator" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Home" })).toBeHidden();
});
