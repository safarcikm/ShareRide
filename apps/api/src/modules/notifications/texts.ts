import type {
  Money,
  NotificationKind,
  NotificationSettings,
  QuickMessage,
  TripRole,
} from "@shareride/domain";
import {
  capitalised,
  carText,
  createTranslator,
  type CarFacts,
  formatClock,
  formatDay,
  formatMoney,
  quickMessageText,
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
  readonly kind: Exclude<NotificationKind, TripReminderFacts["kind"]>;
  /** The recipient's place on the trip. */
  readonly role: TripRole;
  readonly bookingId: string;
  readonly tripId: string;
  /** The other person's first name; for a message, its sender's. */
  readonly name: string;
  readonly seats: number;
  readonly total: Money;
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

export interface NotificationText {
  readonly title: string;
  readonly body: string;
  /** The screen a tap opens. */
  readonly path: string;
  /** The words of an email's link to it, when not the usual "Open in ShareRide". */
  readonly open?: string;
}

function required(moment: Date | null, what: string): Date {
  if (moment === null) throw new Error(`The notification needs ${what}.`);
  return moment;
}

/**
 * The title, body and screen of a notification: the kinds of spec 5's
 * events, new messages, the email about unread ones, and trip reminders.
 */
export function notificationText(
  facts: NotificationFacts | TripReminderFacts,
  locale: Locale,
  settings: NotificationSettings,
): NotificationText {
  return "passengers" in facts
    ? tripReminderText(facts, locale)
    : bookingText(facts, locale, settings);
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
