import type { CancelReason } from "../bookings/cancellation.ts";
import type { CarColour } from "../driving/vehicles.ts";
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
 * item 3), shown in the reader's language: the conversation opened, the
 * departure or the car changed, and the booking cancelled, by whom and why
 * (spec 6).
 */
export const systemLineKeys = ["opened", "departure_changed", "car_changed", "cancelled"] as const;
export type SystemLineKey = (typeof systemLineKeys)[number];

/** A system line as stored, with the canceller's reason (stored in `params`). */
export type SystemLine =
  | { readonly key: "opened" }
  | {
      readonly key: "departure_changed";
      /** The passenger's boarding time before and after the move, in ISO 8601 (spec 6, 3.2). */
      readonly from: string;
      readonly to: string;
    }
  | {
      /** The new car, never its number plate (spec 6, 3.2; R7.9). */
      readonly key: "car_changed";
      readonly make: string;
      readonly model: string;
      readonly colour: CarColour;
    }
  | {
      readonly key: "cancelled";
      readonly by: "passenger" | "driver";
      readonly reason: CancelReason;
      /** The driver's note, as written; empty for none (spec 6, 3.4). */
      readonly note: string;
      /** The driver cancelled the whole trip (spec 6, 3.3), not this booking alone. */
      readonly wholeTrip: boolean;
    };

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
