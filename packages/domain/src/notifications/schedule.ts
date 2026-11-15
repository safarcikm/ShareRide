import { fromIceland, inIceland } from "../time.ts";
import type { NotificationSettings } from "./settings.ts";

// When the notifications that wait for a moment come (spec 7, 3.3 and 3.5).
// The worker checks at that moment that each one still applies.

export interface Reminder {
  readonly which: "evening" | "hour";
  readonly at: Date;
}

const minuteMs = 60_000;

/**
 * The reminders still to come for a boarding (passenger) or a departure
 * (driver): at 18:00 on a clock in Iceland the day before, and an hour
 * before. One whose time is before `since` is skipped. `since` is the later
 * of the confirmation and now: when the departure moves (R7.11), reminders
 * are worked out again from now, so one already sent never comes again.
 */
export function reminderTimes(
  trip: { readonly startsAt: Date; readonly since: Date },
  settings: NotificationSettings,
): Reminder[] {
  const day = inIceland(trip.startsAt);
  const evening = fromIceland({
    ...day,
    day: day.day - 1,
    hour: settings.reminderEveningAt.hour,
    minute: settings.reminderEveningAt.minute,
  });
  const hour = new Date(trip.startsAt.getTime() - settings.reminderBeforeMinutes * minuteMs);
  const reminders: Reminder[] = [
    { which: "evening", at: evening },
    { which: "hour", at: hour },
  ];
  return reminders.filter((reminder) => reminder.at >= trip.since);
}

/** The driver hears again about an unanswered request halfway to its deadline. */
export function requestHalfwayAt(request: {
  readonly requestedAt: Date;
  readonly expiresAt: Date;
}): Date {
  const requested = request.requestedAt.getTime();
  return new Date(requested + (request.expiresAt.getTime() - requested) / 2);
}

/**
 * "10 minutes left to pay"; none when the whole window is that short, as
 * when the booking cut-off shortens it.
 */
export function payReminderAt(
  payment: { readonly acceptedAt: Date; readonly dueAt: Date },
  settings: NotificationSettings,
): Date | null {
  const at = new Date(payment.dueAt.getTime() - settings.payReminderBeforeMinutes * minuteMs);
  return at > payment.acceptedAt ? at : null;
}

/**
 * The email about an unread message: 15 minutes after it, and no sooner than
 * an hour after the last one about the same conversation (3.6, item 3).
 */
export function unreadSummaryAt(
  message: { readonly sentAt: Date; readonly lastSummaryAt: Date | null },
  settings: NotificationSettings,
): Date {
  const after = message.sentAt.getTime() + settings.unreadEmailAfterMinutes * minuteMs;
  const last = message.lastSummaryAt;
  if (last === null) return new Date(after);
  return new Date(Math.max(after, last.getTime() + settings.unreadEmailEveryMinutes * minuteMs));
}
