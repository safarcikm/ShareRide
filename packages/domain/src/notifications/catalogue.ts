import { freeCancellationMoveMinutes } from "../bookings/cancellation.ts";
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
  checked_in: { push: true, email: "never", sms: false },
  checked_in_driver: { push: true, email: "never", sms: false },
  // Reports on the trip day (spec 8, 3.3 to 3.5, 3.9): the other side is
  // asked to answer within 24 hours, and both are told the operator's
  // decision. Push and email, so nobody misses the deadline.
  no_show_marked: { push: true, email: "always", sms: false },
  driver_absent_reported: { push: true, email: "always", sms: false },
  dispute_decided: { push: true, email: "always", sms: false },
  dispute_decided_driver: { push: true, email: "always", sms: false },
  // Reviews (spec 8, 3.7 and 3.9): "How was your trip?" when the trip
  // completes and once more 3 days later, and a review about you that now
  // shows. Push only: a nudge, not news anyone must have.
  rate_trip: { push: true, email: "never", sms: false },
  rate_trip_driver: { push: true, email: "never", sms: false },
  review_visible: { push: true, email: "never", sms: false },
  // News about the account rather than a trip (spec 11): the texts say what
  // is ready and until when, never a link (spec 11, 7).
  data_export_ready: { push: true, email: "always", sms: false },
  // By email only: deleting signs the person out of every device (spec 11, 3.4.5).
  account_deletion_scheduled: { push: false, email: "always", sms: false },
  // The answer to "Ask about my data" goes by email, which asking needs (spec 11, 3.6).
  privacy_request_answered: { push: false, email: "always", sms: false },
} as const satisfies Record<string, NotificationRule>;

export type NotificationKind = keyof typeof notificationRules;
export const notificationKinds = Object.keys(notificationRules) as NotificationKind[];

export type TripRole = "driver" | "passenger";

/** The kinds about the person's account, which no booking or trip event gives. */
export const accountNoticeKinds = [
  "data_export_ready",
  "account_deletion_scheduled",
  "privacy_request_answered",
] as const;
export type AccountNoticeKind = (typeof accountNoticeKinds)[number];

export function isAccountNotice(kind: NotificationKind): kind is AccountNoticeKind {
  return (accountNoticeKinds as readonly NotificationKind[]).includes(kind);
}

/**
 * What can happen, as the catalogue sees it: the domain events of spec 5, 6,
 * 8, 13 and 2, and the moments the worker schedules (the halfway and pay
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
  | { readonly type: "PayoutSent" }
  /** "I'm here" (spec 8, 3.2): `by` said it, and the other side at that stop is told. */
  | { readonly type: "CheckedIn"; readonly by: TripRole }
  /** The driver marked the passenger a no-show (spec 8, 3.3): the passenger may answer. */
  | { readonly type: "NoShowMarked" }
  /** The passenger said the driver didn't come (3.4): the driver may answer. */
  | { readonly type: "DriverAbsentReported" }
  /** The operator decided a contested report (3.5): both are told. */
  | { readonly type: "DisputeDecided" }
  /** "How was your trip?" (3.7.6): when the trip completes, and the reminder 3 days later. */
  | { readonly type: "RateTrip"; readonly to: TripRole }
  /** A review shows (R8.9): the person it is about is told. */
  | { readonly type: "ReviewRevealed"; readonly about: TripRole };

export interface Addressed {
  readonly kind: NotificationKind;
  /** The trip's driver, or the passenger (each passenger concerned, for a trip's events). */
  readonly to: TripRole;
}

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
            Math.abs(event.byMinutes) > freeCancellationMoveMinutes
              ? "departure_moved_far"
              : "departure_moved",
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
    case "CheckedIn":
      return event.by === "driver"
        ? [{ kind: "checked_in", to: "passenger" }]
        : [{ kind: "checked_in_driver", to: "driver" }];
    case "NoShowMarked":
      return [{ kind: "no_show_marked", to: "passenger" }];
    case "DriverAbsentReported":
      return [{ kind: "driver_absent_reported", to: "driver" }];
    case "DisputeDecided":
      return [
        { kind: "dispute_decided", to: "passenger" },
        { kind: "dispute_decided_driver", to: "driver" },
      ];
    case "RateTrip":
      return [
        event.to === "driver"
          ? { kind: "rate_trip_driver", to: "driver" }
          : { kind: "rate_trip", to: "passenger" },
      ];
    case "ReviewRevealed":
      return [{ kind: "review_visible", to: event.about }];
  }
}

const reminderKinds = {
  evening: { passenger: "reminder_evening", driver: "reminder_evening_driver" },
  hour: { passenger: "reminder_hour", driver: "reminder_hour_driver" },
} as const satisfies Record<string, Record<TripRole, NotificationKind>>;

/** What the worker knows about one person when it sends. */
export interface Recipient {
  /** Their place on the trip concerned; null for news about the account. */
  readonly role: TripRole | null;
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
 * for a seat already lost. A passenger's reminder needs the booking still
 * confirmed. The rest tell what happened, and always apply.
 */
export function stillApplies(kind: NotificationKind, status: BookingStatus): boolean {
  switch (kind) {
    case "request_new":
    case "request_halfway":
      return status === "requested";
    case "pay_now":
    case "pay_reminder":
      return status === "accepted";
    // A reminder of a booking that has ended is dropped (R7.11). The
    // driver's reminders are about the trip: the worker checks someone is
    // still booked.
    case "reminder_evening":
    case "reminder_hour":
      return status === "confirmed";
    // "I'm here" matters only while the booking boards (spec 8, 3.2).
    case "checked_in":
    case "checked_in_driver":
      return status === "confirmed";
    // A paused meeting point matters to a booking that will get in or out
    // there: accepted or confirmed (spec 2, 3.6.4).
    case "meeting_point_changed":
      return status === "accepted" || status === "confirmed";
    // A report asks for an answer while the booking is as the report left
    // it (spec 8, 3.3 and 3.4); once decided otherwise, it would ask too late.
    case "no_show_marked":
      return status === "no_show";
    case "driver_absent_reported":
      return status === "confirmed" || status === "completed";
    // Only completed bookings are reviewed (R8.8); a driver absence that
    // stands, or a passenger found absent, removes the reviews (3.4).
    case "rate_trip":
    case "rate_trip_driver":
    case "review_visible":
      return status === "completed";
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
