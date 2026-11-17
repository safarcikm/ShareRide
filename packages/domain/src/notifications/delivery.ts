import type { NotificationSettings } from "./settings.ts";

// How the worker sends (spec 7, 3.7; plan 4.4): each notification has one
// delivery per channel, sent once. A failed send is tried again later, each
// wait twice as long, until `retryForMinutes` have passed.

/**
 * `queued` to send (again) from `next_attempt_at`; `sending` while one
 * worker holds it; then `sent`, `failed` or `skipped` (with the reason).
 */
export const deliveryStatuses = ["queued", "sending", "sent", "failed", "skipped"] as const;
export type DeliveryStatus = (typeof deliveryStatuses)[number];

/**
 * The events booking, payment, chat and privacy code writes to the outbox,
 * in the same transaction.
 */
export const outboxEventTypes = [
  "BookingRequested",
  "BookingAccepted",
  "BookingConfirmed",
  "BookingDeclined",
  "BookingExpired",
  "BookingWithdrawn",
  "BookingCancelled",
  "DepartureMoved",
  "TripChanged",
  "TripCancelled",
  "RefundIssued",
  "MessageSent",
  "CheckedIn",
  "NoShowMarked",
  "DriverAbsentReported",
  "DisputeDecided",
  "BookingCompleted",
  "ReviewRevealed",
  "DataExportReady",
  "ReportFiled",
  "AccountDeletionScheduled",
  "ModerationActionTaken",
  "SuspensionEnded",
  "AppealAnswered",
  "ReportClosed",
] as const;
export type OutboxEventType = (typeof outboxEventTypes)[number];

/**
 * Tries at turning one outbox event into notifications. An event that fails
 * this often is given up (its `failed_at` set) and reported, so it never
 * holds back the events after it.
 */
export const eventAttempts = 5;

/** The wait before the first retry. */
export const firstRetrySeconds = 30;

/**
 * How long a worker may take to send one delivery. A delivery still
 * `sending` after that was cut off, such as by a restart, and is marked
 * failed rather than sent again: nobody gets the same thing twice (R7.6).
 */
export const sendLeaseSeconds = 120;

const secondMs = 1000;

/**
 * When to try a failed send again: 30 seconds after the first attempt, then
 * twice as long each time. Null once that would be more than
 * `retryForMinutes` after the delivery was queued: it has failed.
 */
export function retryAt(
  delivery: { readonly queuedAt: Date; readonly attempts: number },
  now: Date,
  settings: NotificationSettings,
): Date | null {
  const wait = firstRetrySeconds * secondMs * 2 ** Math.max(0, delivery.attempts - 1);
  const next = new Date(now.getTime() + wait);
  const giveUp = delivery.queuedAt.getTime() + settings.retryForMinutes * 60 * secondMs;
  return next.getTime() > giveUp ? null : next;
}

/**
 * The notification log, with its deliveries, is kept 90 days (privacy
 * register); outbox events this many days once processed, and schedules
 * once they have run.
 */
export const notificationRetention = { logDays: 90, processedDays: 7 } as const;
