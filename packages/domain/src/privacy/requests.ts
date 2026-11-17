import { err, ok, type Result } from "../result.ts";
import { addDays, addIcelandMonths } from "./calendar.ts";
import { privacySettings } from "./settings.ts";

/** What "Ask about my data" can be about (spec 11, 3.6). */
export const privacyRequestKinds = ["objection", "restriction", "correction", "question"] as const;
export type PrivacyRequestKind = (typeof privacyRequestKinds)[number];

export interface PrivacyRequestInput {
  readonly kind: PrivacyRequestKind;
  readonly text: string;
}

/** A request's text, trimmed, must be 1 to 2 000 characters. */
export function validatePrivacyRequest(
  input: PrivacyRequestInput,
): Result<PrivacyRequestInput, { readonly code: "request_text_invalid" }> {
  const text = input.text.normalize("NFC").trim();
  if (text.length === 0 || Array.from(text).length > privacySettings.requestTextMaxLength) {
    return err({ code: "request_text_invalid" });
  }
  return ok({ kind: input.kind, text });
}

/** The operator's answer, trimmed, must be 1 to 5 000 characters. */
export function validateRequestAnswer(
  answer: string,
): Result<string, { readonly code: "request_answer_invalid" }> {
  const text = answer.normalize("NFC").trim();
  if (text.length === 0 || Array.from(text).length > privacySettings.requestAnswerMaxLength) {
    return err({ code: "request_answer_invalid" });
  }
  return ok(text);
}

/** A privacy request must be answered within one month (R11.7). */
export function requestDueAt(receivedAt: Date): Date {
  return addIcelandMonths(receivedAt, privacySettings.requestDueMonths);
}

/** Requests received after this count towards the day's limit. */
export function requestsCountedSince(now: Date): Date {
  return addDays(now, -1);
}

export interface RecentRequests {
  /** How many came after `requestsCountedSince(now)`. */
  readonly count: number;
  /** When the oldest of them came; null when none did. */
  readonly oldest: Date | null;
}

export interface RequestsTooMany {
  readonly code: "rate_limited";
  readonly retryAfterSeconds: number;
}

/**
 * At most `requestsPerDay` in 24 hours, against spam: the next is taken once
 * the oldest of them is 24 hours old.
 */
export function requestAllowed(recent: RecentRequests, now: Date): Result<void, RequestsTooMany> {
  if (recent.count < privacySettings.requestsPerDay) return ok(undefined);
  const next = addDays(recent.oldest ?? now, 1).getTime();
  return err({
    code: "rate_limited",
    retryAfterSeconds: Math.max(1, Math.ceil((next - now.getTime()) / 1000)),
  });
}
