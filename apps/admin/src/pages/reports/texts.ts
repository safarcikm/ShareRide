import type {
  AdminConversationMessage,
  AdminModerationAction,
  AdminPerson,
} from "@shareride/contracts";
import type {
  BookingStatus,
  HideableContent,
  ModerationActionKind,
  ModerationRule,
  ReportOutcome,
  ReportSubject,
  TripStatus,
} from "@shareride/domain";
import {
  createTranslator,
  formatClock,
  formatDay,
  moderatedContentText,
  moderationRuleText,
  type Locale,
  type MessageKey,
  type Translate,
} from "@shareride/i18n";

export const reportsPath = "/admin/reports";
export const appealsPath = "/admin/appeals";

export const subjectKeys = {
  user: "admin.reports.subject.user",
  trip: "admin.reports.subject.trip",
  message: "admin.reports.subject.message",
  review: "admin.reports.subject.review",
  booking: "admin.reports.subject.booking",
} as const satisfies Record<ReportSubject, MessageKey>;

export const outcomeKeys = {
  action_taken: "admin.reports.outcome.action_taken",
  no_breach: "admin.reports.outcome.no_breach",
} as const satisfies Record<ReportOutcome, MessageKey>;

export const tripStatusKeys = {
  draft: "admin.reports.tripStatus.draft",
  published: "admin.reports.tripStatus.published",
  departed: "admin.reports.tripStatus.departed",
  completed: "admin.reports.tripStatus.completed",
  cancelled: "admin.reports.tripStatus.cancelled",
} as const satisfies Record<TripStatus, MessageKey>;

export const bookingStatusKeys = {
  requested: "admin.reports.bookingStatus.requested",
  accepted: "admin.reports.bookingStatus.accepted",
  confirmed: "admin.reports.bookingStatus.confirmed",
  declined: "admin.reports.bookingStatus.declined",
  expired: "admin.reports.bookingStatus.expired",
  cancelled: "admin.reports.bookingStatus.cancelled",
  completed: "admin.reports.bookingStatus.completed",
  no_show: "admin.reports.bookingStatus.no_show",
} as const satisfies Record<BookingStatus, MessageKey>;

/** What an action was, in the operator's words. */
export const actionKindKeys = {
  warning: "admin.reports.actionKind.warning",
  content_hidden: "admin.reports.actionKind.content_hidden",
  suspension: "admin.reports.actionKind.suspension",
  reinstatement: "admin.reports.actionKind.reinstatement",
  trip_cancelled: "admin.reports.actionKind.trip_cancelled",
  refund: "admin.reports.actionKind.refund",
} as const satisfies Record<ModerationActionKind, MessageKey>;

/** What the operator hides, in their words. */
export const hiddenKeys = {
  message: "admin.reports.hide.message",
  review: "admin.reports.hide.review",
  trip_note: "admin.reports.hide.trip_note",
  about: "admin.reports.hide.about",
} as const satisfies Record<HideableContent, MessageKey>;

/** A person's first name, or that they have left ShareRide (spec 11, 3.5). */
export const personName = (t: Translate, person: AdminPerson | null) =>
  person?.firstName ?? t("people.formerMember");

/** "15 November at 10:15", on Iceland's clock. */
export function atText(t: Translate, locale: Locale, at: string): string {
  const moment = new Date(at);
  return t("admin.reports.at", { date: formatDay(moment, locale), time: formatClock(moment) });
}

/** Whether the person's account is open, suspended or gone. */
export function standingText(t: Translate, locale: Locale, person: AdminPerson): string {
  switch (person.status) {
    case "active":
      return t("admin.reports.standing.active");
    case "deleted":
      return t("admin.reports.standing.deleted");
    case "suspended":
      return person.suspendedUntil === null
        ? t("admin.reports.standing.suspendedForGood")
        : t("admin.reports.standing.suspended", {
            when: atText(t, locale, person.suspendedUntil),
          });
  }
}

/** Who wrote a message of the conversation: the driver, the passenger or ShareRide. */
export function senderText(t: Translate, from: AdminConversationMessage["from"]): string {
  return t(`admin.reports.from.${from}`);
}

/** "Warning · Harassment · 15 November at 10:15", for the lists of actions. */
export function actionLine(
  t: Translate,
  locale: Locale,
  action: Pick<AdminModerationAction, "kind" | "rule" | "at">,
): string {
  const kind = t(actionKindKeys[action.kind]);
  const when = atText(t, locale, action.at);
  return action.rule === null
    ? t("admin.reports.actionLineNoRule", { kind, when })
    : t("admin.reports.actionLine", { kind, rule: moderationRuleText(t, action.rule), when });
}

/** A statement of reasons before it goes: what the person will be told (R9.5). */
export interface Statement {
  readonly kind: ModerationActionKind;
  readonly rule: ModerationRule | null;
  readonly reason: string;
  readonly content: HideableContent | "trip" | null;
  /** A suspension's end; null for none. */
  readonly until: string | null;
}

/** The notice as the person reads it, in their language (as the app's Notices word it). */
export function statementLines(locale: Locale, statement: Statement): readonly string[] {
  const t = createTranslator(locale);
  const title =
    statement.kind !== "suspension"
      ? t(`notice.title.${statement.kind}`)
      : statement.until === null
        ? t("notice.title.suspensionPermanent")
        : t("notice.title.suspension", {
            until: t("notify.when", {
              date: formatDay(new Date(statement.until), locale),
              time: formatClock(new Date(statement.until)),
            }),
          });
  return [
    title,
    ...(statement.rule === null
      ? []
      : [t("notice.rule", { rule: moderationRuleText(t, statement.rule) })]),
    statement.kind === "reinstatement"
      ? t("notice.note", { note: statement.reason })
      : t("notice.reason", { reason: statement.reason }),
    ...(statement.content === null ? [] : [moderatedContentText(t, statement.content)]),
  ];
}
