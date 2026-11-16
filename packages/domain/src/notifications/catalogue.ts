import type { BookingStatus } from "../bookings/lifecycle.ts";
import type { NotificationSettings } from "./settings.ts";

// The notification catalogue (spec 7, 3.3 and 3.4): who is told about each
// event, and on which channels. Sending is the worker's; these are the rules.

/** Push, then email: `always`, only as the `fallback` without push, or `never`. */
export type EmailRule = "always" | "fallback" | "never";

export interface NotificationRule {
  readonly push: boolean;
  readonly email: EmailRule;
  /** Also by SMS, for passengers close to boarding (3.4). */
  readonly sms: boolean;
}

/**
 * One or more kinds per row of 3.3: one per text, so a kind alone picks its
 * template. A row that tells the driver and the passenger different things
 * has a `_driver` kind; `new_message` and `unread_messages` read the same
 * for both.
 */
export const notificationRules = {
  request_new: { push: true, email: "fallback", sms: false },
  request_halfway: { push: true, email: "fallback", sms: false },
  pay_now: { push: true, email: "always", sms: false },
  pay_reminder: { push: true, email: "never", sms: false },
  booking_confirmed: { push: true, email: "always", sms: false },
  booking_confirmed_driver: { push: true, email: "always", sms: false },
  request_declined: { push: true, email: "always", sms: false },
  request_expired: { push: true, email: "always", sms: false },
  request_expired_driver: { push: true, email: "never", sms: false },
  request_withdrawn: { push: true, email: "never", sms: false },
  payment_window_ended: { push: true, email: "fallback", sms: false },
  payment_window_ended_driver: { push: true, email: "fallback", sms: false },
  departure_moved: { push: true, email: "always", sms: false },
  departure_moved_far: { push: true, email: "always", sms: true },
  trip_changed: { push: true, email: "always", sms: false },
  trip_cancelled: { push: true, email: "always", sms: true },
  booking_cancelled_by_driver: { push: true, email: "always", sms: true },
  booking_cancelled_by_passenger: { push: true, email: "always", sms: false },
  refund_issued: { push: false, email: "always", sms: false },
  meeting_point_changed: { push: true, email: "always", sms: true },
  meeting_point_changed_driver: { push: true, email: "always", sms: false },
  new_message: { push: true, email: "never", sms: false },
  unread_messages: { push: false, email: "fallback", sms: false },
  reminder_evening: { push: true, email: "fallback", sms: false },
  reminder_evening_driver: { push: true, email: "fallback", sms: false },
  reminder_hour: { push: true, email: "never", sms: false },
  reminder_hour_driver: { push: true, email: "never", sms: false },
  payout_sent: { push: false, email: "always", sms: false },
} as const satisfies Record<string, NotificationRule>;

export type NotificationKind = keyof typeof notificationRules;
export const notificationKinds = Object.keys(notificationRules) as NotificationKind[];

export type TripRole = "driver" | "passenger";

/**
 * What can happen, as the catalogue sees it: the domain events of spec 5, 6,
 * 13 and 2, and the moments the worker schedules (the halfway and pay
 * reminders, the unread messages email and the trip reminders).
 * `BookingAccepted` means accepted and waiting for payment: a free booking
 * is confirmed at once and gives `BookingConfirmed` instead (R5.11).
 */
export type NotificationEvent =
  | { readonly type: "BookingRequested" }
  | { readonly type: "RequestHalfway" }
  | { readonly type: "BookingAccepted" }
  | { readonly type: "PaymentDueSoon" }
  | { readonly type: "BookingConfirmed" }
  | { readonly type: "BookingDeclined" }
  | { readonly type: "BookingExpired"; readonly reason: "unanswered" | "unpaid" }
  | { readonly type: "BookingWithdrawn" }
  | { readonly type: "DepartureMoved"; readonly byMinutes: number }
  | { readonly type: "TripChanged" }
  | { readonly type: "TripCancelled" }
  | { readonly type: "BookingCancelled"; readonly by: TripRole }
  | { readonly type: "RefundIssued" }
  | { readonly type: "MeetingPointChanged" }
  | { readonly type: "MessageSent"; readonly to: TripRole }
  | { readonly type: "UnreadMessages"; readonly to: TripRole }
  | { readonly type: "ReminderDue"; readonly which: "evening" | "hour"; readonly to: TripRole }
  | { readonly type: "PayoutSent" };

export interface Addressed {
  readonly kind: NotificationKind;
  /** The trip's driver, or the passenger (each passenger concerned, for a trip's events). */
  readonly to: TripRole;
}

/** A departure moved by more than this many minutes may be cancelled for free, and goes by SMS (3.4). */
const farMoveMinutes = 30;

/** The notifications an event gives, in the order of 3.3. */
export function notificationsFor(event: NotificationEvent): readonly Addressed[] {
  switch (event.type) {
    case "BookingRequested":
      return [{ kind: "request_new", to: "driver" }];
    case "RequestHalfway":
      return [{ kind: "request_halfway", to: "driver" }];
    case "BookingAccepted":
      return [{ kind: "pay_now", to: "passenger" }];
    case "PaymentDueSoon":
      return [{ kind: "pay_reminder", to: "passenger" }];
    case "BookingConfirmed":
      return [
        { kind: "booking_confirmed", to: "passenger" },
        { kind: "booking_confirmed_driver", to: "driver" },
      ];
    case "BookingDeclined":
      return [{ kind: "request_declined", to: "passenger" }];
    case "BookingExpired":
      return event.reason === "unanswered"
        ? [
            { kind: "request_expired", to: "passenger" },
            { kind: "request_expired_driver", to: "driver" },
          ]
        : [
            { kind: "payment_window_ended", to: "passenger" },
            { kind: "payment_window_ended_driver", to: "driver" },
          ];
    case "BookingWithdrawn":
      return [{ kind: "request_withdrawn", to: "driver" }];
    case "DepartureMoved":
      return [
        {
          kind:
            Math.abs(event.byMinutes) > farMoveMinutes ? "departure_moved_far" : "departure_moved",
          to: "passenger",
        },
      ];
    case "TripChanged":
      return [{ kind: "trip_changed", to: "passenger" }];
    case "TripCancelled":
      return [{ kind: "trip_cancelled", to: "passenger" }];
    case "BookingCancelled":
      return event.by === "driver"
        ? [{ kind: "booking_cancelled_by_driver", to: "passenger" }]
        : [{ kind: "booking_cancelled_by_passenger", to: "driver" }];
    case "RefundIssued":
      return [{ kind: "refund_issued", to: "passenger" }];
    case "MeetingPointChanged":
      return [
        { kind: "meeting_point_changed_driver", to: "driver" },
        { kind: "meeting_point_changed", to: "passenger" },
      ];
    case "MessageSent":
      return [{ kind: "new_message", to: event.to }];
    case "UnreadMessages":
      return [{ kind: "unread_messages", to: event.to }];
    case "ReminderDue":
      return [{ kind: reminderKinds[event.which][event.to], to: event.to }];
    case "PayoutSent":
      return [{ kind: "payout_sent", to: "driver" }];
  }
}

const reminderKinds = {
  evening: { passenger: "reminder_evening", driver: "reminder_evening_driver" },
  hour: { passenger: "reminder_hour", driver: "reminder_hour_driver" },
} as const satisfies Record<string, Record<TripRole, NotificationKind>>;

/** What the worker knows about one person when it sends. */
export interface Recipient {
  readonly role: TripRole;
  /** A signed-in device with a push token (3.6, item 1). */
  readonly hasPushDevice: boolean;
  readonly hasVerifiedEmail: boolean;
  readonly hasVerifiedPhone: boolean;
  /**
   * The passenger's boarding time on the trip concerned, if any: for a
   * departure move the earlier of the old and the new time, and for a
   * meeting point the earliest of their bookings it affects, so the SMS
   * window is never missed.
   */
  readonly boardsAt: Date | null;
  /** SMS news sent to them since midnight in Iceland (`startOfIcelandDay`). */
  readonly smsSentToday: number;
}

/**
 * Some notifications ask for something the booking is waiting for: the
 * driver's answer to a request, or the passenger's payment. Once the booking
 * has moved on (its status as of now, `statusAt`), they are not sent, not
 * even when a failed send is tried again: a passenger is never asked to pay
 * for a seat already lost. The rest tell what happened, and always apply.
 */
export function stillApplies(kind: NotificationKind, status: BookingStatus): boolean {
  switch (kind) {
    case "request_new":
    case "request_halfway":
      return status === "requested";
    case "pay_now":
    case "pay_reminder":
      return status === "accepted";
    default:
      return true;
  }
}

export const channels = ["push", "email", "sms"] as const;
export type Channel = (typeof channels)[number];

/**
 * Why a channel was not used. `has_push`: the email is only a fallback and
 * the person has push. The worker's own reasons: `email_off`, no email
 * provider is set up; `sms_off`, SMS is not sent yet (spec 6);
 * `no_longer_applies`, the booking moved on before it was sent
 * (`stillApplies`), or the unread messages were read.
 */
export const skipReasons = [
  "no_device",
  "no_email",
  "has_push",
  "no_phone",
  "outside_sms_window",
  "sms_limit",
  "email_off",
  "sms_off",
  "no_longer_applies",
] as const;
export type SkipReason = (typeof skipReasons)[number];

export type ChannelDecision =
  | { readonly channel: Channel; readonly send: true }
  | { readonly channel: Channel; readonly send: false; readonly reason: SkipReason };

const hourMs = 60 * 60_000;

/**
 * Per channel the kind uses, whether to send to this person now or why not,
 * so a skipped channel is recorded too (3.7, item 5). SMS goes only to
 * passengers, from `smsWindowHours` before boarding until boarding, to a
 * verified number, at most `smsDailyLimit` a day (R7.10).
 */
export function channelsFor(
  kind: NotificationKind,
  recipient: Recipient,
  now: Date,
  settings: NotificationSettings,
): ChannelDecision[] {
  const rule: NotificationRule = notificationRules[kind];
  const decisions: ChannelDecision[] = [];
  const skip = (channel: Channel, reason: SkipReason): ChannelDecision => ({
    channel,
    send: false,
    reason,
  });
  if (rule.push) {
    decisions.push(
      recipient.hasPushDevice ? { channel: "push", send: true } : skip("push", "no_device"),
    );
  }
  if (rule.email !== "never") {
    if (rule.email === "fallback" && recipient.hasPushDevice) {
      decisions.push(skip("email", "has_push"));
    } else {
      decisions.push(
        recipient.hasVerifiedEmail ? { channel: "email", send: true } : skip("email", "no_email"),
      );
    }
  }
  if (rule.sms && recipient.role === "passenger") {
    decisions.push(smsDecision(recipient, now, settings));
  }
  return decisions;
}

function smsDecision(
  recipient: Recipient,
  now: Date,
  settings: NotificationSettings,
): ChannelDecision {
  const skip = (reason: SkipReason): ChannelDecision => ({ channel: "sms", send: false, reason });
  if (!recipient.hasVerifiedPhone) return skip("no_phone");
  const { boardsAt } = recipient;
  if (
    boardsAt === null ||
    now.getTime() < boardsAt.getTime() - settings.smsWindowHours * hourMs ||
    now > boardsAt
  ) {
    return skip("outside_sms_window");
  }
  if (recipient.smsSentToday >= settings.smsDailyLimit) return skip("sms_limit");
  return { channel: "sms", send: true };
}
