import { err, ok, type Result } from "../result.ts";
import type { ChatSettings } from "./settings.ts";

/**
 * One-tap answers (spec 7, 3.1, item 2). They are stored as keys and shown
 * in the reader's language, so a driver writing in Icelandic reaches a
 * passenger reading English.
 */
export const quickMessageKeys = [
  "late",
  "atPoint",
  "onMyWay",
  "whereAreYou",
  "seeYou",
  "thanks",
] as const;
export type QuickMessageKey = (typeof quickMessageKeys)[number];

/** "I'm running {minutes} minutes late" offers these. */
export const lateMinutes = [5, 10, 15, 30] as const;
export type LateMinutes = (typeof lateMinutes)[number];

export type QuickMessage =
  | { readonly key: "late"; readonly minutes: LateMinutes }
  | { readonly key: Exclude<QuickMessageKey, "late"> };

/**
 * What happened to the booking, as lines in its conversation (spec 7, 3.1,
 * item 3), shown in the reader's language. Spec 6 adds its changes.
 */
export const systemLineKeys = ["opened"] as const;
export type SystemLineKey = (typeof systemLineKeys)[number];

/** A message as someone sends it, before it is checked. */
export type MessageInput =
  | { readonly text: string }
  | { readonly quick: { readonly key: string; readonly minutes?: number } };

/** A message that can be stored. */
export type MessageBody =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "quick"; readonly quick: QuickMessage };

export type MessageProblem =
  | { readonly code: "empty" }
  | { readonly code: "too_long"; readonly maxLength: number }
  | { readonly code: "unknown_quick_message" }
  | { readonly code: "invalid_minutes" };

/**
 * Checks a message (R7.2): text of 1 to 1 000 characters once the spaces at
 * either end are dropped, in its composed (NFC) form, which is the form
 * returned for storing, as the booking message is counted; or a known
 * quick message. Phone numbers, emails and links may be sent: the booking is
 * paid and people may need to call each other (spec 7, decision 3).
 */
export function checkMessage(
  input: MessageInput,
  settings: ChatSettings,
): Result<MessageBody, MessageProblem> {
  if ("text" in input) {
    // Stored as counted, so the database's own length check agrees.
    const text = input.text.normalize("NFC").trim();
    if (text === "") return err({ code: "empty" });
    if (Array.from(text).length > settings.messageMaxLength) {
      return err({ code: "too_long", maxLength: settings.messageMaxLength });
    }
    return ok({ kind: "text", text });
  }
  const { key, minutes } = input.quick;
  if (!isQuickMessageKey(key)) return err({ code: "unknown_quick_message" });
  if (key === "late") {
    if (!isLateMinutes(minutes)) return err({ code: "invalid_minutes" });
    return ok({ kind: "quick", quick: { key, minutes } });
  }
  if (minutes !== undefined) return err({ code: "invalid_minutes" });
  return ok({ kind: "quick", quick: { key } });
}

function isQuickMessageKey(key: string): key is QuickMessageKey {
  return (quickMessageKeys as readonly string[]).includes(key);
}

function isLateMinutes(minutes: number | undefined): minutes is LateMinutes {
  return minutes !== undefined && (lateMinutes as readonly number[]).includes(minutes);
}
