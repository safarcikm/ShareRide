import { err, ok, type Result } from "../result.ts";
import { addIcelandMonths } from "./calendar.ts";
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

/** A privacy request must be answered within one month (R11.7). */
export function requestDueAt(receivedAt: Date): Date {
  return addIcelandMonths(receivedAt, privacySettings.requestDueMonths);
}
