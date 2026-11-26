import { randomInt } from "node:crypto";
import { expect } from "@playwright/test";
import { smsOutbox } from "../../playwright.config";
import { readOutbox } from "./outbox";

interface SmsMessage {
  readonly to: string;
  readonly text: string;
}

function messagesTo(phoneNumber: string): SmsMessage[] {
  return readOutbox<SmsMessage>(smsOutbox).filter((message) => message.to === phoneNumber);
}

/** How many text messages were sent to `phoneNumber` so far. */
export function sentCount(phoneNumber: string): number {
  return messagesTo(phoneNumber).length;
}

/**
 * Waits for message number `count` (from 1) to `phoneNumber` and returns its
 * text. The test API writes each text message to the outbox file.
 */
export async function textMessage(phoneNumber: string, count = 1): Promise<string> {
  let text = "";
  await expect
    .poll(() => {
      text = messagesTo(phoneNumber)[count - 1]?.text ?? "";
      return text;
    })
    .not.toBe("");
  return text;
}

/** The six-digit code in a text message. */
export function codeIn(text: string): string {
  const code = /\b(\d{6})\b/.exec(text)?.[1];
  if (code === undefined) throw new Error(`No code in "${text}"`);
  return code;
}

// Icelandic mobile prefixes, with five random digits after them: half a
// million numbers. The test database is new each run.
const mobilePrefixes = ["69", "76", "77", "78", "79"] as const;

/** The numbers this worker gave out, also before their first text message. */
const givenOut = new Set<string>();

/**
 * A new Icelandic mobile number, one nobody had in this run. The test API
 * never sends real text messages.
 *
 * A run draws a few hundred numbers, and two of them out of half a million
 * are the same about one run in ten. The second person then signed in to
 * the first one's account, and their journey failed at "Last step: about
 * you". Every number a journey draws gets a text message at once, and all
 * workers read the same outbox, so a number is `taken` when a message went
 * to it or this worker gave it out.
 */
export function newPhoneNumber(
  taken: (e164: string) => boolean = (e164) => givenOut.has(e164) || sentCount(e164) > 0,
): { local: string; e164: string } {
  for (;;) {
    const prefix = mobilePrefixes[randomInt(mobilePrefixes.length)] ?? "69";
    const digits = String(randomInt(100_000)).padStart(5, "0");
    const e164 = `+354${prefix}${digits}`;
    if (taken(e164)) continue;
    givenOut.add(e164);
    return { local: `${prefix}${digits.slice(0, 1)} ${digits.slice(1)}`, e164 };
  }
}
