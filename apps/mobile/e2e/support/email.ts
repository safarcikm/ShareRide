import { expect, type Page } from "@playwright/test";
import { emailOutbox } from "../../playwright.config";
import { readOutbox } from "./outbox";

// The emails the test API wrote to its outbox instead of sending them.

export interface Email {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

function emailsTo(address: string): Email[] {
  return readOutbox<Email>(emailOutbox).filter((email) => email.to === address);
}

/** Waits for an email to `address` whose subject matches, and returns it. */
export async function emailTo(address: string, subject: RegExp): Promise<Email> {
  let found: Email | undefined;
  await expect
    .poll(() => {
      found = emailsTo(address).find((email) => subject.test(email.subject));
      return found !== undefined;
    })
    .toBe(true);
  if (found === undefined) throw new Error("No email.");
  return found;
}

/** The link in an email's text, after "label: ". */
export function linkIn(email: Email, label: string): string {
  const link = new RegExp(`${label}: (\\S+)`).exec(email.text)?.[1];
  if (link === undefined) throw new Error(`No "${label}" link in the email.`);
  return link;
}

/** Opens the link sent to confirm `address`, such as the one given at sign-up. */
export async function confirmEmail(page: Page, address: string) {
  const confirm = await emailTo(address, /^Confirm your email for PuffinRide$/);
  await page.goto(linkIn(confirm, "Confirm my email"));
  await expect(page.getByRole("heading", { name: "Your email is added" })).toBeVisible();
}
