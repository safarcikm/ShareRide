import {
  announcementPreview,
  appealDueAt,
  isAccountNotice,
  isAppealable,
  isOperatorNotice,
  defaultSafetySettings,
  type AccountNoticeKind,
  type AppealOutcome,
  type CancelReason,
  type ModeratedContent,
  type ModerationActionKind,
  type ModerationRule,
  type Money,
  type NotificationKind,
  type NotificationSettings,
  type OperatorNoticeKind,
  type QuickMessage,
  type ReportOutcome,
  type SwitchKey,
  type TripRole,
} from "@shareride/domain";
import { notificationScreens } from "@shareride/contracts";
import {
  cancelReasonText,
  capitalised,
  carText,
  createTranslator,
  type CarFacts,
  formatClock,
  formatDate,
  formatDay,
  formatDayAndMonth,
  formatMoney,
  moderatedContentText,
  moderationRuleText,
  quickMessageText,
  reportOutcomeText,
  stopAddedText,
  type Locale,
  type MessageKey,
} from "@shareride/i18n";

// The words of a notification, made when it is sent, in the recipient's
// language and Iceland's time (R7.7). Icelandic changes the endings of names
// and places, so they come after a colon or a dot (spec 7, section 8).

/**
 * What a notification is about, as the worker reads it when it sends: first
 * names, places and times, never a phone number, email address, number plate
 * or payment details (R7.9).
 */
export interface NotificationFacts {
  readonly kind: Exclude<
    NotificationKind,
    | TripReminderFacts["kind"]
    | PointPausedFacts["kind"]
    | PointMovedFacts["kind"]
    | AccountNoticeKind
    | OperatorNoticeKind
  >;
  /** The recipient's place on the trip. */
  readonly role: TripRole;
  readonly bookingId: string;
  readonly tripId: string;
  /** The other person's first name; for a message, its sender's. */
  readonly name: string;
  readonly seats: number;
  readonly total: Money;
  /** A cancelled booking's reason and refund (spec 6); otherwise null and nothing. */
  readonly cancelReason: CancelReason | null;
  readonly refund: Money;
  /** Where the passenger gets in and out, named in the recipient's language. */
  readonly from: string;
  readonly to: string;
  readonly boardsAt: Date;
  readonly requestExpiresAt: Date | null;
  readonly paymentDueAt: Date | null;
  /** For a new message: its text, or its quick message. */
  readonly message: { readonly text: string } | { readonly quick: QuickMessage } | null;
  /** The meeting point where the passenger gets in, for "Directions". */
  readonly boardPointId: string;
  /** The trip's car: make, model and colour, never its number plate. */
  readonly car: CarFacts | null;
  /** For a new car: the car that change made, as `car` (spec 6, 3.2). */
  readonly newCar: CarFacts | null;
  /** For a new stop: its name in the recipient's language, and its time (spec 6, 3.2). */
  readonly newStop: { readonly name: string; readonly plannedAt: Date } | null;
  /** For a stop removed: its name in the recipient's language (spec 6, 3.2). */
  readonly removedStop: { readonly name: string } | null;
  /** For a moved departure: the passenger's boarding time before and after (spec 6, 3.2). */
  readonly moved: { readonly from: Date; readonly to: Date } | null;
  /** Confirmed and not free: what they paid would come back if they cancelled (R6.3). */
  readonly paid: boolean;
  /** For a report to answer: until when the other side can (spec 8, R8.6); otherwise null. */
  readonly answerBy: Date | null;
  /** For a paused meeting point: the point, while the pause still applies; otherwise null. */
  readonly pausedPoint: PausedPoint | null;
  /** For a moved meeting point: the point, while the booking still gets in or out there. */
  readonly movedPoint: MovedPoint | null;
}

/** A moved meeting point as a notification tells of it (spec 2, 3.6.6). */
export interface MovedPoint {
  /** In the recipient's language. */
  readonly name: string;
}

/**
 * A moved meeting point, told to the driver of a trip still to stop there
 * (spec 2, 3.6.6): about the trip, as passengers may not be booked yet.
 */
export interface PointMovedFacts {
  readonly kind: "meeting_point_moved_driver";
  readonly role: "driver";
  readonly tripId: string;
  /** The trip's planned time at the point. */
  readonly stopsAt: Date;
  readonly movedPoint: MovedPoint;
}

/** A paused meeting point as a notification tells of it (spec 2, 3.6.4). */
export interface PausedPoint {
  /** In the recipient's language, as is the operator's reason. */
  readonly name: string;
  readonly reason: string;
  /** The day it is back in use, such as "2026-11-30", or null until the operator says. */
  readonly until: string | null;
  /** Retired while paused: it never comes back, and the trips still need another stop. */
  readonly retired: boolean;
}

/**
 * A paused meeting point, told to the driver of a trip still to stop there
 * (spec 2, 3.6.4): about the trip, as passengers may not be booked yet.
 */
export interface PointPausedFacts {
  readonly kind: "meeting_point_changed_driver";
  readonly role: "driver";
  readonly tripId: string;
  /** The trip's planned time at the point. */
  readonly stopsAt: Date;
  readonly point: PausedPoint;
}

/** A driver's trip reminder (3.5): about the trip and everyone booked on it. */
export interface TripReminderFacts {
  readonly kind: "reminder_evening_driver" | "reminder_hour_driver";
  readonly role: "driver";
  readonly tripId: string;
  readonly departsAt: Date;
  /** Booked and confirmed, in the order they get in. */
  readonly passengers: readonly {
    readonly name: string;
    readonly from: string;
    readonly to: string;
  }[];
  /** Whether the car has no number plate yet: the reminder asks for it (spec 3). */
  readonly plateMissing: boolean;
}

/** What each account notice says; a kind added without its facts does not compile. */
interface AccountNoticeFactsByKind {
  /** Until when the file can be downloaded. */
  readonly data_export_ready: { readonly until: Date };
  /** When the data is erased. */
  readonly account_deletion_scheduled: { readonly until: Date };
  readonly moderation_action: {
    readonly action: ModerationActionKind;
    /** None for a reinstatement. */
    readonly rule: ModerationRule | null;
    /** As the operator wrote it for the person: their reason, or a reinstatement's note. */
    readonly reason: string;
    /** The end of a suspension; null for one for good. */
    readonly until: Date | null;
    readonly at: Date;
    /** What it affected, when it was something they posted, a trip or a booking. */
    readonly content: ModeratedContent | null;
  };
  readonly suspension_ended: object;
  readonly appeal_answered: {
    readonly outcome: AppealOutcome;
    /** As the operator wrote it for the person. */
    readonly answer: string;
  };
  /** In general terms only, never what was done to whom (spec 9, 3.1.6). */
  readonly report_closed: { readonly outcome: ReportOutcome };
  readonly privacy_request_answered: { readonly receivedAt: Date; readonly answer: string };
  /** The reply as the operator wrote it, and the day the feedback was sent. */
  readonly feedback_replied: { readonly sentAt: Date; readonly reply: string };
  /** The operator's news, as they wrote it in the person's language (spec 10, 3.5.3). */
  readonly announcement: { readonly title: string; readonly message: string };
  /** The operator's own copy before sending: both languages (3.5.2). */
  readonly announcement_test: {
    readonly titleIs: string;
    readonly titleEn: string;
    readonly messageIs: string;
    readonly messageEn: string;
  };
}

/**
 * News about the person's account: their data ready to download, or their
 * deletion and when the data is erased (spec 11); an operator's action that
 * affects them, with its statement of reasons (spec 9, R9.5), the end of
 * their suspension (3.6), the answer to their appeal (3.4.4), or the outcome
 * of their report (3.1.6); the answer to a request about their data, with
 * the day it came (spec 11, 3.6).
 */
export type AccountNoticeFacts = {
  readonly [Kind in AccountNoticeKind]: { readonly kind: Kind } & AccountNoticeFactsByKind[Kind];
}[AccountNoticeKind];

export function isAccountFacts(facts: {
  readonly kind: NotificationKind;
}): facts is AccountNoticeFacts {
  return isAccountNotice(facts.kind);
}

/**
 * To the operator: a new report, only whether it is about safety (spec 9,
 * R9.9); the switches for emergencies that are off now (spec 10, 3.3); or
 * how many members joined since when, and the members in all (spec 25,
 * R25.4), never who.
 */
export type OperatorNoticeFacts =
  | { readonly kind: Exclude<OperatorNoticeKind, "switch_still_off" | "new_members"> }
  | { readonly kind: "switch_still_off"; readonly off: readonly SwitchKey[] }
  | {
      readonly kind: "new_members";
      readonly count: number;
      readonly since: Date;
      readonly total: number;
    };

export function isOperatorFacts(facts: {
  readonly kind: NotificationKind;
}): facts is OperatorNoticeFacts {
  return isOperatorNotice(facts.kind);
}

/** The app's screen for downloading one's data (spec 11, 3.2). */
export const downloadDataPath = notificationScreens.downloadData;

/** Where signing in while a deletion waits shows "Keep my account" (spec 11, 3.4.4). */
export const deletionWaitPath = "/";

/** Where a person asks about their data (spec 11, 3.6). */
export const privacyPath = notificationScreens.privacy;

export interface NotificationText {
  readonly title: string;
  readonly body: string;
  /** The screen a tap opens. */
  readonly path: string;
  /** The words of an email's link to it, when not the usual "Open in ShareRide". */
  readonly open?: string;
  /** The email's words, when they say more than the push may (a statement of reasons). */
  readonly emailBody?: string;
  /** Why the email came, when not the usual words about having an account. */
  readonly footer?: string;
}

function required<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`The notification needs ${what}.`);
  return value;
}

/**
 * The words of an SMS (spec 7, 3.4), for the kinds that go by SMS: short,
 * with the day and time, and never a name, place or note (R7.9).
 */
export function smsText(facts: NotificationFacts | OperatorNoticeFacts, locale: Locale): string {
  const t = createTranslator(locale);
  if (isOperatorFacts(facts)) {
    // Never who or what: the operator reads it in the console (spec 9, R9.9).
    return t(facts.kind === "console_recovered" ? "sms.consoleRecovered" : "sms.reportFiledUrgent");
  }
  const values = { date: formatDay(facts.boardsAt, locale), time: formatClock(facts.boardsAt) };
  switch (facts.kind) {
    case "booking_cancelled_by_driver":
      return t(
        facts.refund.amount > 0 ? "sms.bookingCancelled" : "sms.bookingCancelledUnpaid",
        values,
      );
    case "trip_cancelled":
      return t(facts.refund.amount > 0 ? "sms.tripCancelled" : "sms.tripCancelledUnpaid", values);
    // Moved or paused: what happened is in the app (spec 7, 3.4).
    case "meeting_point_changed":
    case "meeting_point_moved":
      return t("sms.meetingPointChanged", { date: values.date });
    case "departure_moved_far": {
      // The new time, with the offer of a full refund to someone who paid (R6.3).
      const { to } = required(facts.moved, "the move");
      return t(facts.paid ? "sms.departureMoved" : "sms.departureMovedUnpaid", {
        date: formatDay(to, locale),
        time: formatClock(to),
      });
    }
    default:
      throw new Error(`No SMS for ${facts.kind} yet.`);
  }
}

/**
 * The title, body and screen of a notification: the kinds of spec 5's
 * events, new messages, the email about unread ones, and trip reminders.
 */
export function notificationText(
  facts:
    | NotificationFacts
    | TripReminderFacts
    | PointPausedFacts
    | PointMovedFacts
    | AccountNoticeFacts
    | OperatorNoticeFacts,
  locale: Locale,
  settings: NotificationSettings,
): NotificationText {
  if (isAccountFacts(facts)) return accountText(facts, locale);
  if (isOperatorFacts(facts)) return operatorText(facts, locale);
  if (facts.kind === "meeting_point_moved_driver") return pointMovedText(facts, locale);
  if ("point" in facts) return pointPausedText(facts, locale);
  return "passengers" in facts
    ? tripReminderText(facts, locale)
    : bookingText(facts, locale, settings);
}

/** The switches' names, as the console's Settings page has them. */
const switchNames = {
  signups_open: "admin.settings.name.signups_open",
  trips_open: "admin.settings.name.trips_open",
  bookings_open: "admin.settings.name.bookings_open",
  sms_sending: "admin.settings.name.sms_sending",
  email_sending: "admin.settings.name.email_sending",
  push_sending: "admin.settings.name.push_sending",
} as const satisfies Record<SwitchKey, MessageKey>;

/**
 * Only that a report came in, and whether about safety, never who or what
 * (R9.9); which switches are off, by name; or how many joined (spec 25).
 */
function operatorText(facts: OperatorNoticeFacts, locale: Locale): NotificationText {
  const t = createTranslator(locale);
  if (facts.kind === "switch_still_off") {
    const names = facts.off.map((key) => t(switchNames[key])).join(", ");
    return {
      title: t("notify.switchStillOff"),
      body: t("notify.switchStillOffBody", { names }),
      path: "/",
    };
  }
  if (facts.kind === "new_members") {
    // By email to the operator who turned it on, with how to turn it off (spec 25).
    const when = t("notify.when", {
      date: formatDayAndMonth(facts.since, locale),
      time: formatClock(facts.since),
    });
    return {
      title: t("notify.newMembers", { count: facts.count }),
      body: t("notify.newMembersBody", { when, count: facts.count, total: facts.total }),
      path: "/admin",
      open: t("notify.newMembersOpen"),
      footer: t("notify.newMembersFooter"),
    };
  }
  if (facts.kind === "console_recovered") {
    // By email, which a SIM swap does not reach; the link opens the console (spec 22).
    return {
      title: t("email.consoleRecovered.subject"),
      body: t("email.consoleRecovered.body"),
      path: "/admin",
      open: t("email.consoleRecovered.open"),
    };
  }
  return facts.kind === "report_filed_urgent"
    ? { title: t("notify.reportFiledUrgent"), body: t("notify.reportFiledUrgentBody"), path: "/" }
    : { title: t("notify.reportFiled"), body: t("notify.reportFiledBody"), path: "/" };
}

/** The app's screen of the person's notices, where they read and appeal them (spec 9, R9.5). */
export const noticesPath = notificationScreens.notices;

/** "My feedback", a page of Profile, where a reply shows (spec 12, 3.3.5). */
export const myFeedbackPath = notificationScreens.feedback;

/** "Beta news", opened from Profile's Notifications, where the announcements sent to the person are (plan 4.7). */
export const betaNewsPath = notificationScreens.betaNews;

/** An announcement's email: the message, then why they get it and how to stop it (spec 10, 7). */
function announcementEmail(message: string, locale: Locale): string {
  const t = createTranslator(locale);
  return [message, "", `${t("announcement.footer")} ${t("announcement.turnOff")}`].join("\n");
}

/**
 * What is ready, or what will be deleted, and when; never a link to the file
 * (spec 11, 7). No weekday: Icelandic would have to decline it after "fyrir".
 */
function accountText(facts: AccountNoticeFacts, locale: Locale): NotificationText {
  const t = createTranslator(locale);
  const when = (moment: Date) =>
    t("notify.when", { date: formatDayAndMonth(moment, locale), time: formatClock(moment) });
  switch (facts.kind) {
    case "data_export_ready":
      return {
        title: t("notify.dataExportReady"),
        body: t("notify.dataExportReadyBody", { until: when(facts.until) }),
        path: downloadDataPath,
      };
    case "account_deletion_scheduled":
      return {
        title: t("notify.accountDeletionScheduled"),
        body: t("notify.accountDeletionScheduledBody", { date: when(facts.until) }),
        path: deletionWaitPath,
      };
    case "privacy_request_answered":
      // The answer itself, as the operator wrote it, after a line that says
      // which request it answers.
      return {
        title: t("notify.privacyRequestAnswered"),
        body: `${t("notify.privacyRequestAnsweredBody", { date: formatDayAndMonth(facts.receivedAt, locale) })}\n\n${facts.answer}`,
        path: privacyPath,
      };
    case "suspension_ended":
      return {
        title: t("notice.title.reinstatement"),
        body: t("notify.suspensionEnded"),
        path: "/",
      };
    case "moderation_action":
      return noticeText(facts, locale);
    case "appeal_answered": {
      const body =
        facts.outcome === "reversed" ? t("notify.appealReversed") : t("notify.appealUpheld");
      const title = t("notify.appealAnswered");
      return {
        title,
        body,
        path: noticesPath,
        emailBody: [title, "", body, "", t("notice.answer", { answer: facts.answer })].join("\n"),
        open: t("notice.open"),
      };
    }
    case "feedback_replied": {
      // The push says only that there is a reply, as others may see a lock
      // screen; the email carries the reply itself.
      const title = t("notify.feedbackReplied");
      const body = t("notify.feedbackRepliedBody");
      const about = t("notify.feedbackRepliedEmail", {
        date: formatDayAndMonth(facts.sentAt, locale),
      });
      return {
        title,
        body,
        path: myFeedbackPath,
        emailBody: [about, "", facts.reply].join("\n"),
        open: t("notify.feedbackOpen"),
      };
    }
    case "announcement":
      // The push shows the start of the message; the email carries all of it.
      return {
        title: facts.title,
        body: announcementPreview(facts.message),
        path: betaNewsPath,
        emailBody: announcementEmail(facts.message, locale),
        open: t("announcement.open"),
      };
    case "announcement_test": {
      // Marked as a test, with both languages one after the other, each as
      // its readers will get it.
      const [title, message] =
        locale === "is" ? [facts.titleIs, facts.messageIs] : [facts.titleEn, facts.messageEn];
      return {
        title: t("announcement.test", { title }),
        body: announcementPreview(message),
        path: betaNewsPath,
        emailBody: [
          facts.titleIs,
          "",
          announcementEmail(facts.messageIs, "is"),
          "",
          "----",
          "",
          facts.titleEn,
          "",
          announcementEmail(facts.messageEn, "en"),
        ].join("\n"),
        open: t("announcement.open"),
      };
    }
    case "report_closed":
      return {
        title: t("notify.reportClosed"),
        body: reportOutcomeText(t, facts.outcome),
        path: notificationScreens.reports,
      };
  }
}

/**
 * An operator's action, as the person is told (spec 9, 3.4.4; R9.5). The
 * push says only what happened, as others may see a lock screen; the email
 * is the copy of the statement of reasons: the rule, the reason as the
 * operator wrote it, and until when it can be appealed in the app
 * (milestone 9 decision 1).
 */
function noticeText(
  facts: Extract<AccountNoticeFacts, { kind: "moderation_action" }>,
  locale: Locale,
): NotificationText {
  const t = createTranslator(locale);
  // No weekday, as for the account's other news: "til" would decline it.
  const when = (moment: Date) =>
    t("notify.when", { date: formatDayAndMonth(moment, locale), time: formatClock(moment) });
  const title =
    facts.action === "suspension"
      ? facts.until === null
        ? t("notice.title.suspensionPermanent")
        : t("notice.title.suspension", { until: when(facts.until) })
      : t(`notice.title.${facts.action}`);
  if (!isAppealable(facts.action)) {
    const body = t("notify.reinstatedBody");
    return {
      title,
      body,
      path: "/",
      emailBody: [body, "", t("notice.note", { note: facts.reason })].join("\n"),
    };
  }
  const appealBy = appealDueAt(facts.at, defaultSafetySettings);
  return {
    title,
    body: t("notify.noticeBody"),
    path: noticesPath,
    emailBody: [
      title,
      "",
      t("notice.rule", { rule: moderationRuleText(t, required(facts.rule, "the rule")) }),
      t("notice.reason", { reason: facts.reason }),
      ...(facts.content === null ? [] : [moderatedContentText(t, facts.content)]),
      "",
      t("notice.appealUntil", { until: when(appealBy) }),
    ].join("\n"),
    open: t("notice.open"),
  };
}

function bookingText(
  facts: NotificationFacts,
  locale: Locale,
  settings: NotificationSettings,
): NotificationText {
  const t = createTranslator(locale);
  const { name, from, to, seats } = facts;
  const when = (moment: Date) =>
    t("notify.when", { date: formatDay(moment, locale), time: formatClock(moment) });
  const part = () => t("notify.part", { seats, from, to, when: when(facts.boardsAt) });
  const searchAgain = () => t("notify.searchAgain", { from, to, when: when(facts.boardsAt) });
  const payBy = () =>
    t("notify.payBy", {
      total: formatMoney(facts.total, locale),
      time: formatClock(required(facts.paymentDueAt, "the payment deadline")),
    });

  const [title, body] = ((): readonly [string, string] => {
    switch (facts.kind) {
      case "request_new":
        return [t("notify.requestNew", { name }), part()];
      case "request_halfway":
        return [
          t("notify.requestHalfway", { name }),
          t("notify.answerBy", {
            when: when(required(facts.requestExpiresAt, "the request's deadline")),
          }),
        ];
      case "pay_now":
        return [t("notify.payNow", { from, to }), payBy()];
      case "pay_reminder":
        return [t("notify.payReminder", { minutes: settings.payReminderBeforeMinutes }), payBy()];
      case "booking_confirmed":
        return [
          t("notify.confirmed"),
          t("notify.confirmedWhere", { when: when(facts.boardsAt), point: from }),
        ];
      case "booking_confirmed_driver":
        return [t("notify.confirmedDriver", { name }), part()];
      case "request_declined":
        return [t("notify.declined"), searchAgain()];
      case "request_expired":
        return [t("notify.expired"), searchAgain()];
      case "request_expired_driver":
        return [t("notify.expiredDriver", { name }), part()];
      case "request_withdrawn":
        return [t("notify.withdrawn", { name }), part()];
      case "payment_window_ended":
        return [t("notify.unpaid"), searchAgain()];
      case "payment_window_ended_driver":
        return [t("notify.unpaidDriver", { name }), part()];
      case "booking_cancelled_by_passenger":
        return [t("notify.cancelledByPassenger", { name }), part()];
      // A suspended passenger's booking (spec 9, 3.6): never why.
      case "booking_cancelled_by_shareride":
        return [t("notify.cancelledByShareRide", { name }), part()];
      // "I'm here" (spec 8, 3.2): who, at the passenger's meeting point.
      case "checked_in":
      case "checked_in_driver":
        return [t("notify.checkedIn", { name }), from];
      // A report on the trip day (spec 8, 3.3 and 3.4): the other side is
      // asked whether it is right, and until when they can say. Never the
      // note, which is for the operator.
      case "no_show_marked":
      case "driver_absent_reported":
        return [
          facts.kind === "no_show_marked"
            ? t("notify.noShowMarked")
            : t("notify.driverAbsentReported", { name }),
          t("notify.reportBody", {
            from,
            to,
            when: when(facts.boardsAt),
            deadline: when(required(facts.answerBy, "the time to answer")),
          }),
        ];
      // The outcome is on the booking and trip pages (3.5).
      case "dispute_decided":
      case "dispute_decided_driver":
        return [
          t("notify.disputeDecided"),
          t("notify.disputeDecidedBody", { from, to, when: when(facts.boardsAt) }),
        ];
      // Reviews (spec 8, 3.7): "How was your trip?", and one about you that shows.
      case "rate_trip":
        return [
          t("review.title"),
          t("notify.rateDriver", { name, from, to, when: when(facts.boardsAt) }),
        ];
      case "rate_trip_driver":
        return [t("review.title"), t("notify.ratePassengers")];
      case "review_visible":
        return [
          t("notify.reviewVisible"),
          t("notify.reviewVisibleBody", { from, to, when: when(facts.boardsAt) }),
        ];
      case "booking_cancelled_by_driver":
      case "trip_cancelled":
        // Never the driver's note: it may hold a number (R7.9). ShareRide
        // gives no reason: it cancelled for a suspension (spec 9, 3.6).
        return [
          facts.kind === "trip_cancelled" && facts.cancelReason === null
            ? t("notify.tripCancelledByShareRide")
            : t(
                facts.kind === "trip_cancelled"
                  ? "notify.tripCancelled"
                  : "notify.cancelledByDriver",
                { reason: cancelReasonText(t, required(facts.cancelReason, "the reason")) },
              ),
          facts.refund.amount > 0
            ? t("notify.cancelledRefundBody", {
                from,
                to,
                when: when(facts.boardsAt),
                total: formatMoney(facts.refund, locale),
              })
            : searchAgain(),
        ];
      case "departure_moved":
      case "departure_moved_far": {
        // The passenger's own boarding time, before and after (spec 6, 3.2).
        const moved = required(facts.moved, "the move");
        const where = { from, to, when: when(moved.to) };
        return [
          t("trip.changed", { old: formatClock(moved.from), new: formatClock(moved.to) }),
          facts.kind === "departure_moved_far" && facts.paid
            ? t("notify.movedFarBody", where)
            : t("notify.movedBody", where),
        ];
      }
      case "trip_changed": {
        // Their part and when they get in, as for a move.
        const part = t("notify.movedBody", { from, to, when: when(facts.boardsAt) });
        // The new car, never its number plate (R7.9), or the stop added or
        // removed (spec 6, 3.2).
        if (facts.newCar !== null) {
          return [t("trip.carChanged", { car: carText(t, facts.newCar) }), part];
        }
        if (facts.removedStop !== null) {
          return [t("trip.stopRemoved", { stop: facts.removedStop.name }), part];
        }
        const stop = required(facts.newStop, "the new car or stop");
        return [
          stopAddedText(t, { stop: stop.name, plannedAt: stop.plannedAt.toISOString() }),
          part,
        ];
      }
      // A paused meeting point where the passenger gets in or out (spec 2,
      // 3.6.4): the operator's reason, and when it is back if they said.
      case "meeting_point_changed": {
        const point = required(facts.pausedPoint, "the paused point");
        return [
          t(point.retired ? "notify.pointRetired" : "notify.pointPaused", { point: point.name }),
          [
            point.reason,
            ...(point.until === null
              ? []
              : [t("notify.pointBack", { date: formatDate(point.until, locale) })]),
            t("notify.pointPausedBody", { from, to, when: when(facts.boardsAt) }),
          ].join("\n"),
        ];
      }
      // A moved meeting point where the passenger gets in or out (spec 2,
      // 3.6.6): their part, and to look where it is now.
      case "meeting_point_moved": {
        const point = required(facts.movedPoint, "the moved point");
        return [
          t("notify.pointMoved", { point: point.name }),
          t("notify.pointMovedBody", { from, to, when: when(facts.boardsAt) }),
        ];
      }
      case "refund_issued":
        return [
          t("notify.refunded", { total: formatMoney(facts.total, locale) }),
          t("notify.refundedBody", { from, to, when: when(facts.boardsAt) }),
        ];
      case "new_message": {
        const { message } = facts;
        if (message === null) throw new Error("The notification needs its message.");
        return [
          t("notify.newMessage", { name }),
          "text" in message ? message.text : quickMessageText(t, message.quick),
        ];
      }
      case "unread_messages":
        // Never the messages themselves (R7.9).
        return [
          t("email.unreadMessages", { date: formatDay(facts.boardsAt, locale) }),
          t("email.unreadMessagesBody"),
        ];
      case "reminder_evening":
      case "reminder_hour": {
        const values = { time: formatClock(facts.boardsAt), point: from };
        const { car } = facts;
        return [
          t(facts.kind === "reminder_evening" ? "reminder.evening" : "reminder.hour", values),
          car === null
            ? t("reminder.driverWithoutCar", { name })
            : t("reminder.driver", { name, car: carText(t, car) }),
        ];
      }
      default:
        throw new Error(`No text for ${facts.kind} yet.`);
    }
  })();

  const reminder = facts.kind === "reminder_evening" || facts.kind === "reminder_hour";
  const path =
    facts.kind === "new_message" || facts.kind === "unread_messages"
      ? `/messages/${facts.bookingId}`
      : reminder
        ? // "Directions" opens the meeting point page, with its photo (3.5).
          `/meeting-points/${facts.boardPointId}`
        : facts.kind === "rate_trip"
          ? // Straight to rating the driver (spec 20, 3.1.3); the driver's
            // trip lists each passenger to rate.
            `/bookings/${facts.bookingId}/rate`
          : facts.role === "driver"
            ? `/drive/trips/${facts.tripId}`
            : `/bookings/${facts.bookingId}`;
  return {
    title: capitalised(title, locale),
    // A message is shown as its sender wrote it.
    body: facts.kind === "new_message" ? body : capitalised(body, locale),
    path,
    ...(reminder ? { open: t("reminder.directions") } : {}),
  };
}

/** Who gets in and out where, one line each, and the number plate if it is missing. */
function tripReminderText(facts: TripReminderFacts, locale: Locale): NotificationText {
  const t = createTranslator(locale);
  const values = { time: formatClock(facts.departsAt), count: facts.passengers.length };
  const lines = facts.passengers.map((passenger) => t("reminder.passenger", { ...passenger }));
  if (facts.plateMissing) lines.push(t("reminder.addPlate"));
  return {
    title: capitalised(
      t(
        facts.kind === "reminder_evening_driver" ? "reminder.driverEvening" : "reminder.driverHour",
        values,
      ),
      locale,
    ),
    body: lines.join("\n"),
    path: `/drive/trips/${facts.tripId}`,
  };
}

/** The driver is told where the trip stops has moved (spec 2, 3.6.6), on the trip's page. */
function pointMovedText(facts: PointMovedFacts, locale: Locale): NotificationText {
  const t = createTranslator(locale);
  const when = t("notify.when", {
    date: formatDay(facts.stopsAt, locale),
    time: formatClock(facts.stopsAt),
  });
  return {
    title: capitalised(t("notify.pointMoved", { point: facts.movedPoint.name }), locale),
    body: t("notify.pointMovedDriverBody", { when }),
    path: `/drive/trips/${facts.tripId}`,
  };
}

/** The driver is asked to choose another stop (spec 2, 3.6.4), on the trip's page. */
function pointPausedText(facts: PointPausedFacts, locale: Locale): NotificationText {
  const t = createTranslator(locale);
  const { point } = facts;
  const when = t("notify.when", {
    date: formatDay(facts.stopsAt, locale),
    time: formatClock(facts.stopsAt),
  });
  return {
    title: capitalised(
      t(point.retired ? "notify.pointRetired" : "notify.pointPaused", { point: point.name }),
      locale,
    ),
    body: [
      point.reason,
      ...(point.until === null
        ? []
        : [t("notify.pointBack", { date: formatDate(point.until, locale) })]),
      t("notify.pointPausedDriverBody", { when }),
    ].join("\n"),
    path: `/drive/trips/${facts.tripId}`,
  };
}
