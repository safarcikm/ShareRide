import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect } from "@playwright/test";
import { smsOutbox } from "../../playwright.config";

interface SmsMessage {
  readonly to: string;
  readonly text: string;
}

function messagesTo(phoneNumber: string): SmsMessage[] {
  return readFileSync(smsOutbox, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as SmsMessage)
    .filter((message) => message.to === phoneNumber);
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

// Icelandic mobile prefixes; with five random digits after them, numbers
// do not repeat within a run in practice. The test database is new each run.
const mobilePrefixes = ["69", "76", "77", "78", "79"] as const;

/** A new Icelandic mobile number. The test API never sends real text messages. */
export function newPhoneNumber(): { local: string; e164: string } {
  const prefix = mobilePrefixes[randomInt(mobilePrefixes.length)] ?? "69";
  const digits = String(randomInt(100_000)).padStart(5, "0");
  return {
    local: `${prefix}${digits.slice(0, 1)} ${digits.slice(1)}`,
    e164: `+354${prefix}${digits}`,
  };
}
