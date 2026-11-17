import {
  isAccountNotice,
  type AccountNoticeKind,
  type CancelReason,
  type Money,
  type NotificationKind,
  type NotificationSettings,
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
  formatDate,
  formatDay,
  formatDayAndMonth,
  formatMoney,
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
    TripReminderFacts["kind"] | PointPausedFacts["kind"] | AccountNoticeKind
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

/**
 * News about the person's account (spec 11): a data export, until when it
 * can be downloaded; a deletion, when the data is erased; the answer to a
 * request about their data, with the day it came.
 */
export type AccountNoticeFacts =
  | {
      readonly kind: Exclude<AccountNoticeKind, "privacy_request_answered">;
      readonly until: Date;
    }
  | {
      readonly kind: "privacy_request_answered";
      readonly receivedAt: Date;
      readonly answer: string;
    };

/** The app's screen for downloading one's data (spec 11, 3.2). */
export const downloadDataPath = "/settings/privacy/download";

/** Where signing in while a deletion waits shows "Keep my account" (spec 11, 3.4.4). */
export const deletionWaitPath = "/";

/** Where a person asks about their data (spec 11, 3.6). */
export const privacyPath = "/settings/privacy";

export interface NotificationText {
  readonly title: string;
  readonly body: string;
  /** The screen a tap opens. */
  readonly path: string;
  /** The words of an email's link to it, when not the usual "Open in ShareRide". */
  readonly open?: string;
}

function required<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`The notification needs ${what}.`);
  return value;
}

/**
 * The words of an SMS (spec 7, 3.4), for the kinds that go by SMS: short,
 * with the day and time, and never a name, place or note (R7.9).
 */
export function smsText(facts: NotificationFacts, locale: Locale): string {
  const t = createTranslator(locale);
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

const isAccountFacts = (
  facts: NotificationFacts | TripReminderFacts | PointPausedFacts | AccountNoticeFacts,
): facts is AccountNoticeFacts => isAccountNotice(facts.kind);

/**
 * The title, body and screen of a notification: the kinds of spec 5's
 * events, new messages, the email about unread ones, and trip reminders.
 */
export function notificationText(
  facts: NotificationFacts | TripReminderFacts | PointPausedFacts | AccountNoticeFacts,
  locale: Locale,
  settings: NotificationSettings,
): NotificationText {
  if (isAccountFacts(facts)) return accountText(facts, locale);
  if ("point" in facts) return pointPausedText(facts, locale);
  return "passengers" in facts
    ? tripReminderText(facts, locale)
    : bookingText(facts, locale, settings);
}

/**
 * What is ready, or what will be deleted, and when; never a link to the file
 * (spec 11, 7). No weekday: Icelandic would have to decline it after "fyrir".
 */
function accountText(facts: AccountNoticeFacts, locale: Locale): NotificationText {
  const t = createTranslator(locale);
  if (facts.kind === "privacy_request_answered") {
    // The answer itself, as the operator wrote it, after a line that says
    // which request it answers.
    return {
      title: t("notify.privacyRequestAnswered"),
      body: `${t("notify.privacyRequestAnsweredBody", { date: formatDayAndMonth(facts.receivedAt, locale) })}\n\n${facts.answer}`,
      path: privacyPath,
    };
  }
  const when = t("notify.when", {
    date: formatDayAndMonth(facts.until, locale),
    time: formatClock(facts.until),
  });
  switch (facts.kind) {
    case "data_export_ready":
      return {
        title: t("notify.dataExportReady"),
        body: t("notify.dataExportReadyBody", { until: when }),
        path: downloadDataPath,
      };
    case "account_deletion_scheduled":
      return {
        title: t("notify.accountDeletionScheduled"),
        body: t("notify.accountDeletionScheduledBody", { date: when }),
        path: deletionWaitPath,
      };
  }
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
        // Never the driver's note: it may hold a number (R7.9).
        return [
          t(facts.kind === "trip_cancelled" ? "notify.tripCancelled" : "notify.cancelledByDriver", {
            reason: cancelReasonText(t, required(facts.cancelReason, "the reason")),
          }),
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
