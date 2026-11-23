import { expect } from "@playwright/test";
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

/** How many emails to `address` so far whose subject matches. */
export function emailCount(address: string, subject: RegExp): number {
  return emailsTo(address).filter((email) => subject.test(email.subject)).length;
}

/** Waits for email number `count` (from 1) to `address` whose subject matches. */
export async function nthEmailTo(address: string, subject: RegExp, count: number): Promise<Email> {
  let found: Email | undefined;
  await expect
    .poll(() => {
      found = emailsTo(address).filter((email) => subject.test(email.subject))[count - 1];
      return found !== undefined;
    })
    .toBe(true);
  if (found === undefined) throw new Error("No email.");
  return found;
}

/** A sign-in code's email, in English or Icelandic: the code leads the subject (spec 26, 3.2). */
export const signInCodeSubject = /^\d{6} (is your PuffinRide code|er PuffinRide-kóðinn þinn)$/;

/** A confirm code's email (spec 26, 3.6). */
export const confirmCodeSubject =
  /^\d{6} (is your PuffinRide code to confirm|er PuffinRide-kóðinn til að staðfesta)$/;

/** The six-digit code at the start of a code email's subject. */
export function codeInSubject(email: Email): string {
  const code = /^(\d{6}) /.exec(email.subject)?.[1];
  if (code === undefined) throw new Error(`No code in "${email.subject}"`);
  return code;
}

/**
 * Runs `send`, which makes the API email a code to `address`, and gives
 * that code: the next email whose subject matches.
 */
export async function emailedCode(
  address: string,
  subject: RegExp,
  send: () => Promise<unknown>,
): Promise<string> {
  const before = emailCount(address, subject);
  await send();
  return codeInSubject(await nthEmailTo(address, subject, before + 1));
}

/** The link in an email's text, after "label: ". */
export function linkIn(email: Email, label: string): string {
  const link = new RegExp(`${label}: (\\S+)`).exec(email.text)?.[1];
  if (link === undefined) throw new Error(`No "${label}" link in the email.`);
  return link;
}
