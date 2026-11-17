import {
  appealDueAt,
  isAccountNotice,
  isAppealable,
  isOperatorNotice,
  defaultSafetySettings,
  type AccountNoticeKind,
  type CancelReason,
  type ModerationActionKind,
  type ModerationRule,
  type Money,
  type NotificationKind,
  type NotificationSettings,
  type OperatorNoticeKind,
  type QuickMessage,
  type TripRole,
} from "@shareride/domain";
import {
  cancelReasonText,
  capitalised,
  carText,
  createTranslator,
  type CarFacts,
  formatClock,
  formatDay,
  formatMoney,
  moderationRuleText,
  quickMessageText,
  stopAddedText,
  type Locale,
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
    TripReminderFacts["kind"] | AccountNoticeKind | OperatorNoticeKind
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

/** News about the person's account (spec 11): a data export, and until when it can be downloaded. */
/**
 * News about the person's account: their data ready to download (spec 11),
 * an operator's action that affects them, with its statement of reasons
 * (spec 9, R9.5), or the end of their suspension (3.6).
 */
/** What each account notice says; a kind added without its facts does not compile. */
interface AccountNoticeFactsByKind {
  readonly data_export_ready: { readonly expiresAt: Date };
  readonly moderation_action: {
    readonly action: ModerationActionKind;
    /** None for a reinstatement. */
    readonly rule: ModerationRule | null;
    /** As the operator wrote it for the person: their reason, or a reinstatement's note. */
    readonly reason: string;
    /** The end of a suspension; null for one for good. */
    readonly until: Date | null;
    readonly at: Date;
  };
  readonly suspension_ended: object;
}

export type AccountNoticeFacts = {
  readonly [Kind in AccountNoticeKind]: { readonly kind: Kind } & AccountNoticeFactsByKind[Kind];
}[AccountNoticeKind];

export function isAccountFacts(facts: {
  readonly kind: NotificationKind;
}): facts is AccountNoticeFacts {
  return isAccountNotice(facts.kind);
}

/** A new report, to the operator: only whether it is about safety (spec 9, R9.9). */
export interface OperatorNoticeFacts {
  readonly kind: OperatorNoticeKind;
}

export function isOperatorFacts(facts: {
  readonly kind: NotificationKind;
}): facts is OperatorNoticeFacts {
  return isOperatorNotice(facts.kind);
}

/** The app's screen for downloading one's data (spec 11, 3.2). */
export const downloadDataPath = "/settings/privacy/download";

export interface NotificationText {
  readonly title: string;
  readonly body: string;
  /** The screen a tap opens. */
  readonly path: string;
  /** The words of an email's link to it, when not the usual "Open in ShareRide". */
  readonly open?: string;
  /** The email's words, when they say more than the push may (a statement of reasons). */
  readonly emailBody?: string;
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
  // Never who or what: the operator reads it in the console (spec 9, R9.9).
  if (isOperatorFacts(facts)) return t("sms.reportFiledUrgent");
  const values = { date: formatDay(facts.boardsAt, locale), time: formatClock(facts.boardsAt) };
  switch (facts.kind) {
    case "booking_cancelled_by_driver":
      return t(
        facts.refund.amount > 0 ? "sms.bookingCancelled" : "sms.bookingCancelledUnpaid",
        values,
      );
    case "trip_cancelled":
      return t(facts.refund.amount > 0 ? "sms.tripCancelled" : "sms.tripCancelledUnpaid", values);
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
  facts: NotificationFacts | TripReminderFacts | AccountNoticeFacts | OperatorNoticeFacts,
  locale: Locale,
  settings: NotificationSettings,
): NotificationText {
  if (isAccountFacts(facts)) return accountText(facts, locale);
  if (isOperatorFacts(facts)) return operatorText(facts.kind, locale);
  return "passengers" in facts
    ? tripReminderText(facts, locale)
    : bookingText(facts, locale, settings);
}

/** Only that a report came in, and whether about safety, never who or what (R9.9). */
function operatorText(kind: OperatorNoticeKind, locale: Locale): NotificationText {
  const t = createTranslator(locale);
  return kind === "report_filed_urgent"
    ? { title: t("notify.reportFiledUrgent"), body: t("notify.reportFiledUrgentBody"), path: "/" }
    : { title: t("notify.reportFiled"), body: t("notify.reportFiledBody"), path: "/" };
}

/** What is ready and until when, never a link (spec 11, 7). */
function accountText(facts: AccountNoticeFacts, locale: Locale): NotificationText {
  const t = createTranslator(locale);
  const when = (moment: Date) =>
    t("notify.when", { date: formatDay(moment, locale), time: formatClock(moment) });
  switch (facts.kind) {
    case "data_export_ready":
      return {
        title: t("notify.dataExportReady"),
        body: t("notify.dataExportReadyBody", { until: when(facts.expiresAt) }),
        path: downloadDataPath,
      };
    case "suspension_ended":
      return {
        title: t("notice.title.reinstatement"),
        body: t("notify.suspensionEnded"),
        path: "/",
      };
    case "moderation_action":
      return noticeText(facts, locale);
  }
}

/** The app's screen of the person's notices, where they read and appeal them (spec 9, R9.5). */
export const noticesPath = "/notices";

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
  const when = (moment: Date) =>
    t("notify.when", { date: formatDay(moment, locale), time: formatClock(moment) });
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
