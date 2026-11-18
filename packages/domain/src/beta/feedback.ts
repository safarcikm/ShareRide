// Feedback from testers (spec 12, 3.3; R12.5): a message, the app's
// technical details and, from phones, a screenshot the person has seen.
import { checkPhotoFile, type PhotoFileIssue, type PhotoSize } from "../meeting-points/photos.ts";
import { addDays, addIcelandMonths } from "../privacy/calendar.ts";
import { err, ok, type Result } from "../result.ts";

export const feedbackKinds = ["problem", "idea", "other"] as const;
export type FeedbackKind = (typeof feedbackKinds)[number];

/** Where the operator has got to with it; a new one is `new`. */
export const feedbackStatuses = ["new", "read", "planned", "done", "wont_do"] as const;
export type FeedbackStatus = (typeof feedbackStatuses)[number];

export const feedbackPlatforms = ["ios", "android", "web"] as const;
export type FeedbackPlatform = (typeof feedbackPlatforms)[number];

export const feedbackRules = {
  messageMaxLength: 2000,
  /** The operator's reply, sent by push and email. */
  replyMaxLength: 1000,
  /** What one person can send in 24 hours, so the form cannot flood the operator. */
  perDay: 10,
  /** Bytes in a screenshot: 1 MB. */
  screenshotMaxBytes: 1024 * 1024,
  appVersionMaxLength: 32,
  osVersionMaxLength: 64,
  /** The screen's name: its route, never an address with someone's ID in it. */
  screenMaxLength: 120,
  /** Feedback is deleted this long after the beta ends (spec 12, section 7). */
  keptMonths: 12,
} as const;

/** Feedback as the app sends it, before it is checked. */
export interface FeedbackDraft {
  readonly kind: string;
  readonly message: string;
  readonly appVersion: string;
  readonly platform: string;
  readonly osVersion: string;
  readonly screen: string;
}

/** Feedback that can be stored. */
export interface CheckedFeedback extends FeedbackDraft {
  readonly kind: FeedbackKind;
  readonly platform: FeedbackPlatform;
}

export type FeedbackProblem =
  | { readonly code: "kind_unknown" }
  | { readonly code: "platform_unknown" }
  | { readonly code: "message_missing" }
  | { readonly code: "message_too_long"; readonly maxLength: number }
  | { readonly code: "details_invalid"; readonly field: "appVersion" | "osVersion" | "screen" };

const lengthOf = (text: string) => Array.from(text).length;

/** One line of ordinary characters, within its length. */
const isDetail = (text: string, min: number, max: number) =>
  lengthOf(text) >= min && lengthOf(text) <= max && !/\p{Cc}/u.test(text);

/**
 * Checks feedback (R12.5): a known kind and platform; a message of 1 to
 * 2 000 characters once the spaces at either end are dropped, in its
 * composed (NFC) form, as chat counts its messages; and the app's details,
 * each one line within its length. The system version may be empty: a
 * browser has none worth keeping.
 */
export function checkFeedback(draft: FeedbackDraft): Result<CheckedFeedback, FeedbackProblem> {
  const { kind, platform } = draft;
  if (!(feedbackKinds as readonly string[]).includes(kind)) return err({ code: "kind_unknown" });
  if (!(feedbackPlatforms as readonly string[]).includes(platform)) {
    return err({ code: "platform_unknown" });
  }
  const message = draft.message.normalize("NFC").trim();
  if (message === "") return err({ code: "message_missing" });
  if (lengthOf(message) > feedbackRules.messageMaxLength) {
    return err({ code: "message_too_long", maxLength: feedbackRules.messageMaxLength });
  }
  const appVersion = draft.appVersion.trim();
  const osVersion = draft.osVersion.trim();
  const screen = draft.screen.trim();
  if (!isDetail(appVersion, 1, feedbackRules.appVersionMaxLength)) {
    return err({ code: "details_invalid", field: "appVersion" });
  }
  if (!isDetail(osVersion, 0, feedbackRules.osVersionMaxLength)) {
    return err({ code: "details_invalid", field: "osVersion" });
  }
  if (!isDetail(screen, 1, feedbackRules.screenMaxLength)) {
    return err({ code: "details_invalid", field: "screen" });
  }
  return ok({
    kind: kind as FeedbackKind,
    platform: platform as FeedbackPlatform,
    message,
    appVersion,
    osVersion,
    screen,
  });
}

export type ReplyProblem =
  | { readonly code: "reply_missing" }
  | { readonly code: "reply_too_long"; readonly maxLength: number };

/** The operator's reply: 1 to 1 000 characters, trimmed. */
export function checkReply(reply: string): Result<string, ReplyProblem> {
  const text = reply.normalize("NFC").trim();
  if (text === "") return err({ code: "reply_missing" });
  if (lengthOf(text) > feedbackRules.replyMaxLength) {
    return err({ code: "reply_too_long", maxLength: feedbackRules.replyMaxLength });
  }
  return ok(text);
}

/**
 * A screenshot: a JPEG of at most 1 MB that carries nothing besides the
 * picture, as the app writes it (the check of meeting point photos, ADR
 * 0029).
 */
export function checkScreenshot(bytes: Uint8Array): Result<PhotoSize, PhotoFileIssue> {
  if (bytes.length > feedbackRules.screenshotMaxBytes) return err("too_large");
  return checkPhotoFile(bytes);
}

/** Feedback sent after this counts towards the day's limit. */
export function feedbackCountedSince(now: Date): Date {
  return addDays(now, -1);
}

export interface RecentFeedback {
  /** How many came after `feedbackCountedSince(now)`. */
  readonly count: number;
  /** When the oldest of them came; null when none did. */
  readonly oldest: Date | null;
}

export interface FeedbackTooMany {
  readonly code: "rate_limited";
  readonly retryAfterSeconds: number;
}

/** At most `perDay` in 24 hours: the next is taken once the oldest of them is a day old. */
export function feedbackAllowed(recent: RecentFeedback, now: Date): Result<void, FeedbackTooMany> {
  if (recent.count < feedbackRules.perDay) return ok(undefined);
  const next = addDays(recent.oldest ?? now, 1).getTime();
  return err({
    code: "rate_limited",
    retryAfterSeconds: Math.max(1, Math.ceil((next - now.getTime()) / 1000)),
  });
}

/**
 * Feedback sent at or before this moment is deleted now, or null while
 * none is: 12 months after the beta ended, which is when "Invite code
 * required" was last turned off (spec 12, section 7), and never while it
 * is on. Feedback sent after the beta ended is kept its own 12 months.
 */
export function feedbackDeletedUpTo(betaEndedAt: Date | null, now: Date): Date | null {
  if (betaEndedAt === null) return null;
  const due = addIcelandMonths(betaEndedAt, feedbackRules.keptMonths);
  if (due.getTime() > now.getTime()) return null;
  return addIcelandMonths(now, -feedbackRules.keptMonths);
}
