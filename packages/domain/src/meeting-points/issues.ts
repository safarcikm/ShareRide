// Problem reports about a meeting point (spec 2, 3.5; rule R2.8): someone
// signed in says what is wrong, and the operator's queue gets it.
import { err, ok, type Result } from "../result.ts";
import { characterCount } from "../safety/settings.ts";
import { isVisible, type MeetingPointStatus } from "./catalogue.ts";

/** Spec 2, 3.5: closed or moved, unsafe, wrong location, wrong information, other. */
export const meetingPointIssueReasons = [
  "closed_or_moved",
  "unsafe",
  "wrong_location",
  "wrong_information",
  "other",
] as const;
export type MeetingPointIssueReason = (typeof meetingPointIssueReasons)[number];

export const meetingPointIssueStatuses = ["open", "resolved"] as const;
export type MeetingPointIssueStatus = (typeof meetingPointIssueStatuses)[number];

export const meetingPointIssueLimits = {
  /** The note, in characters as people see them. */
  noteMax: 300,
  /** Reports one person may send in 24 hours (R2.8). */
  perDay: 5,
  /** Months a resolved report is kept before it is deleted (spec 2, section 7). */
  keptMonths: 12,
} as const;

export interface MeetingPointIssueDraft {
  readonly reason: MeetingPointIssueReason;
  readonly note: string;
}

export type MeetingPointIssueProblem =
  { readonly code: "not_found" } | { readonly code: "too_long" };

/**
 * A report as it is stored, with its note trimmed; only for a point people
 * can see, as a draft or a retired point is not there for them.
 */
export function checkMeetingPointIssue(
  draft: MeetingPointIssueDraft,
  status: MeetingPointStatus,
): Result<MeetingPointIssueDraft, MeetingPointIssueProblem> {
  if (!isVisible(status)) return err({ code: "not_found" });
  const note = draft.note.normalize("NFC").trim();
  if (characterCount(note) > meetingPointIssueLimits.noteMax) return err({ code: "too_long" });
  return ok({ reason: draft.reason, note });
}

const dayMs = 24 * 3_600_000;

/**
 * Null while a person may send another report; otherwise the seconds until
 * they may, a day after the oldest of the last 24 hours' reports (R2.8).
 */
export function meetingPointIssueRetryAfter(sentAt: readonly Date[], now: Date): number | null {
  const today = sentAt
    .map((at) => at.getTime())
    .filter((at) => at > now.getTime() - dayMs)
    .sort((a, b) => a - b);
  if (today.length < meetingPointIssueLimits.perDay) return null;
  const oldest = today[today.length - meetingPointIssueLimits.perDay] ?? now.getTime();
  return Math.ceil((oldest + dayMs - now.getTime()) / 1000);
}
