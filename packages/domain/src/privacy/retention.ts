import { err, ok, type Result } from "../result.ts";
import { fromIceland, inIceland } from "../time.ts";
import { addDays, addIcelandMonths } from "./calendar.ts";
import { privacySettings } from "./settings.ts";

/**
 * Every retention rule the scheduled clean-up enforces (spec 11, 3.7; R11.5),
 * by the name its runs are recorded under. The periods of the older rules
 * stay with their modules (`retentionCutoffs` for sign-in records,
 * `deleteArrivedBy` for conversations, `notificationRetention`,
 * `draftRetentionDays`, `operatorSessionRules`); `privacyCutoffs` has the
 * ones this feature adds.
 */
export const retentionRules = [
  "sign_in_codes",
  "rate_limit_events",
  "session_tokens",
  "idle_sessions",
  "ended_sessions",
  "email_links",
  "trip_drafts",
  "conversations",
  "trips_and_bookings",
  "notification_log",
  "scheduled_notifications",
  "outbox_events",
  "operator_sessions",
  "operator_sign_in",
  "data_exports",
  "accounts",
  "blocked_numbers",
  "erased_accounts",
  "privacy_requests",
  /** Problem reports about meeting points, 12 months after they were resolved (spec 2, section 7). */
  "meeting_point_issues",
  /** The beta's feedback, 12 months after the beta ended (spec 12, section 7). */
  "feedback",
  /** The search log, which holds no person, after 14 months (spec 10, 3.4.5). */
  "search_log",
  "holds",
  "retention_runs",
] as const;
export type RetentionRule = (typeof retentionRules)[number];

export interface PrivacyCutoffs {
  /** The files of exports whose 7 days ended at or before this are deleted. */
  readonly exportsExpiredBy: Date;
  /** Exports that expired before this are deleted, dates and all. */
  readonly exportRecordsExpiredBefore: Date;
  /** Accounts whose waiting period ended at or before this are erased. */
  readonly deletionsDueBy: Date;
  /** Blocked numbers kept until at or before this are deleted. */
  readonly blockedNumbersUntil: Date;
  /** The record of an erased account older than this is deleted. */
  readonly erasedAccountsBefore: Date;
  /** Trips whose last stop was at or before this are anonymised, with their bookings. */
  readonly tripsArrivedBy: Date;
  /** Privacy requests answered at or before this are deleted. */
  readonly requestsAnsweredBy: Date;
  /** Records of clean-up runs older than this are deleted. */
  readonly retentionRunsBefore: Date;
  /** Holds that ended, or ran to their end, at or before this are deleted. */
  readonly holdsEndedBefore: Date;
}

export function privacyCutoffs(now: Date): PrivacyCutoffs {
  const yearsAgo = (years: number) => addIcelandMonths(now, -12 * years);
  return {
    exportsExpiredBy: now,
    exportRecordsExpiredBefore: addDays(now, -privacySettings.exportRecordsKeptDays),
    deletionsDueBy: now,
    blockedNumbersUntil: now,
    erasedAccountsBefore: addDays(now, -privacySettings.erasedAccountsKeptDays),
    tripsArrivedBy: yearsAgo(privacySettings.tripsKeptYears),
    requestsAnsweredBy: yearsAgo(privacySettings.requestsKeptYears),
    retentionRunsBefore: addDays(now, -privacySettings.retentionRunsKeptDays),
    holdsEndedBefore: yearsAgo(privacySettings.holdsKeptYears),
  };
}

/** What a hold can cover: everything about a person, a trip or a booking. */
export const holdSubjectKinds = ["user", "trip", "booking"] as const;
export type HoldSubjectKind = (typeof holdSubjectKinds)[number];

export interface HoldSubject {
  readonly kind: HoldSubjectKind;
  readonly id: string;
}

/** Keeps records past their date while a dispute, chargeback or claim needs them (3.7.3). */
export interface Hold {
  readonly subject: HoldSubject;
  readonly endsAt: Date;
  /** When the operator ended it early. */
  readonly endedAt: Date | null;
}

/**
 * Whether a record is held. A record names every subject it belongs to: a
 * message, for example, its booking, its trip and both people.
 */
export function isHeld(
  holds: readonly Hold[],
  subjects: readonly HoldSubject[],
  now: Date,
): boolean {
  return holds.some(
    (hold) =>
      hold.endedAt === null &&
      hold.endsAt > now &&
      subjects.some(
        (subject) => subject.kind === hold.subject.kind && subject.id === hold.subject.id,
      ),
  );
}

export type HoldError =
  { readonly code: "hold_reason_required" } | { readonly code: "hold_end_not_future" };

/** A hold needs a reason and an end date (R11.6). */
export function validateHold(
  input: { readonly reason: string; readonly endsAt: Date },
  now: Date,
): Result<{ readonly reason: string; readonly endsAt: Date }, HoldError> {
  const reason = input.reason.trim();
  if (reason.length === 0) return err({ code: "hold_reason_required" });
  if (input.endsAt <= now) return err({ code: "hold_end_not_future" });
  return ok({ reason, endsAt: input.endsAt });
}

const dayPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * When a hold given until a calendar day ends: it lasts through that day
 * in Iceland. Null unless the day is a real one written `YYYY-MM-DD`.
 */
export function holdEndsAt(day: string): Date | null {
  const match = dayPattern.exec(day);
  if (match === null) return null;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const start = fromIceland({ year, month, day: date, hour: 0, minute: 0 });
  const shown = inIceland(start);
  if (shown.year !== year || shown.month !== month || shown.day !== date) return null;
  return fromIceland({ year, month, day: date + 1, hour: 0, minute: 0 });
}
