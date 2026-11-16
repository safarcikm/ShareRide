// Reporting (spec 9, 3.1 and 3.4; rules R9.1, R9.3 and R9.9): what can be
// reported and by whom, which reports are urgent, and the operator's queue.
import { addIcelandMonths } from "../privacy/calendar.ts";
import { err, ok, type Result } from "../result.ts";
import { characterCount, type SafetySettings } from "./settings.ts";

export const reportSubjects = ["user", "trip", "message", "review", "booking"] as const;
export type ReportSubject = (typeof reportSubjects)[number];

/**
 * Spec 9, 3.1.2. Misuse of a women-only trip joins them with spec 14. A
 * no-show or a driver who didn't come is spec 8's flow, not a report.
 */
export const reportCategories = [
  "safety",
  "harassment",
  "discrimination",
  "scam",
  "false_info",
  "offensive",
  "not_as_listed",
  "other",
] as const;
export type ReportCategory = (typeof reportCategories)[number];

export const reportStatuses = ["open", "closed"] as const;
export type ReportStatus = (typeof reportStatuses)[number];

/** What the reporter is told, in general terms (3.1.6). */
export const reportOutcomes = ["action_taken", "no_breach"] as const;
export type ReportOutcome = (typeof reportOutcomes)[number];

/** What the API knows about the thing reported. */
export type ReportContext =
  | { readonly kind: "user"; readonly userId: string }
  | { readonly kind: "trip"; readonly driverId: string }
  | {
      readonly kind: "message";
      /** Empty for a system line, which nobody wrote. */
      readonly senderId: string | null;
      readonly memberIds: readonly string[];
    }
  | { readonly kind: "review"; readonly authorId: string }
  | {
      readonly kind: "booking";
      readonly passengerId: string;
      readonly driverId: string;
      readonly tripCompletedAt: Date | null;
    };

export interface ReportDraft {
  readonly category: ReportCategory;
  readonly description: string;
}

export interface CheckedReport {
  /** The person reported: never told who reported them (R9.2). */
  readonly subjectUserId: string;
  readonly urgent: boolean;
  readonly description: string;
}

export type ReportProblem =
  | { readonly code: "own" }
  | { readonly code: "not_involved" }
  | { readonly code: "not_reportable" }
  | { readonly code: "too_long" }
  | { readonly code: "window_closed" };

const hourMs = 3_600_000;

/** Whether this person may report this, and whom it is about (R9.1). */
export function checkReport(
  reporterId: string,
  context: ReportContext,
  draft: ReportDraft,
  now: Date,
  settings: SafetySettings,
): Result<CheckedReport, ReportProblem> {
  const subject = subjectOf(reporterId, context, now, settings);
  if (!subject.ok) return subject;
  const description = draft.description.trim();
  if (characterCount(description) > settings.textMaxLength) return err({ code: "too_long" });
  return ok({ subjectUserId: subject.value, urgent: isUrgent(draft.category), description });
}

function subjectOf(
  reporterId: string,
  context: ReportContext,
  now: Date,
  settings: SafetySettings,
): Result<string, ReportProblem> {
  switch (context.kind) {
    case "user":
      return context.userId === reporterId ? err({ code: "own" }) : ok(context.userId);
    case "trip":
      return context.driverId === reporterId ? err({ code: "own" }) : ok(context.driverId);
    case "review":
      return context.authorId === reporterId ? err({ code: "own" }) : ok(context.authorId);
    case "message":
      if (context.senderId === null) return err({ code: "not_reportable" });
      if (context.senderId === reporterId) return err({ code: "own" });
      if (!context.memberIds.includes(reporterId)) return err({ code: "not_involved" });
      return ok(context.senderId);
    case "booking": {
      const other =
        reporterId === context.passengerId
          ? context.driverId
          : reporterId === context.driverId
            ? context.passengerId
            : null;
      if (other === null) return err({ code: "not_involved" });
      const closesAt =
        context.tripCompletedAt &&
        context.tripCompletedAt.getTime() + settings.bookingReportHours * hourMs;
      if (closesAt && now.getTime() > closesAt) return err({ code: "window_closed" });
      return ok(other);
    }
  }
}

/** Safety reports are urgent: the operator is alerted at once (3.4.1). */
export function isUrgent(category: ReportCategory): boolean {
  return category === "safety";
}

/** A report about a booking holds its payout until the operator decides (R9.3). */
export function holdsPayout(report: {
  readonly subject: ReportSubject;
  readonly status: ReportStatus;
}): boolean {
  return report.subject === "booking" && report.status === "open";
}

/** Every report is answered within 24 hours (R9.9). */
export function responseDueAt(filedAt: Date, settings: SafetySettings): Date {
  return new Date(filedAt.getTime() + settings.responseHours * hourMs);
}

/** The operator's queue: urgent reports first, then the oldest (3.4.1). */
export function queueOrder(
  a: { readonly urgent: boolean; readonly filedAt: Date },
  b: { readonly urgent: boolean; readonly filedAt: Date },
): number {
  if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
  return a.filedAt.getTime() - b.filedAt.getTime();
}

/** The 24 hours' reports a person filed reach the limit: the next is refused. */
export function reportLimitReached(filedInLastDay: number, settings: SafetySettings): boolean {
  return filedInLastDay >= settings.reportsPerDay;
}

/**
 * Reports closed at or before this moment are past their retention, and so
 * no longer keep the conversation they cover (spec 9, section 7): 3 years,
 * on Iceland's calendar.
 */
export function reportsClosedBy(now: Date, settings: SafetySettings): Date {
  return addIcelandMonths(now, -12 * settings.reportKeptYears);
}
