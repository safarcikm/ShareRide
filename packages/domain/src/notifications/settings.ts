// The values the operator will set for notifications and reminders (spec 7,
// section 6). Until the operator settings exist they are these defaults,
// passed to every rule.

export interface NotificationSettings {
  /** The evening reminder, on a clock in Iceland, the day before (`reminder_evening_at`). */
  readonly reminderEveningAt: { readonly hour: number; readonly minute: number };
  /** The last reminder, this many minutes before boarding or departure (`reminder_before_boarding`). */
  readonly reminderBeforeMinutes: number;
  /** SMS news only this many hours before boarding at the earliest (`sms_window`, R7.10). */
  readonly smsWindowHours: number;
  /** SMS news per person per day, codes apart (`sms_daily_limit`, R7.10). */
  readonly smsDailyLimit: number;
  /** A chat message still unread this long is summarised by email (`unread_email_after`). */
  readonly unreadEmailAfterMinutes: number;
  /** At most one such email per conversation in this many minutes. */
  readonly unreadEmailEveryMinutes: number;
  /** "10 minutes left to pay", this many minutes before the payment deadline. */
  readonly payReminderBeforeMinutes: number;
  /** A failed send is retried for this long, then marked failed (spec 7, 3.7). */
  readonly retryForMinutes: number;
}

/** The starting values (spec 7, approved 2026-11-13). */
export const defaultNotificationSettings: NotificationSettings = {
  reminderEveningAt: { hour: 18, minute: 0 },
  reminderBeforeMinutes: 60,
  smsWindowHours: 24,
  smsDailyLimit: 5,
  unreadEmailAfterMinutes: 15,
  unreadEmailEveryMinutes: 60,
  payReminderBeforeMinutes: 10,
  retryForMinutes: 60,
};
