import { fromIceland, inIceland } from "../time.ts";

/** Messages are deleted this many months after their trip (privacy register: messages). */
export const messageRetentionMonths = 12;

/**
 * Conversations whose trip's planned arrival is at or before this moment
 * are deleted with their messages: 12 calendar months ago, in Iceland.
 */
export function deleteArrivedBy(now: Date): Date {
  const today = inIceland(now);
  const month = today.month - messageRetentionMonths;
  const yearAgo = fromIceland({ ...today, month });
  // On a day the month a year ago lacks (29 February), its last day: never sooner than 12 months.
  return inIceland(yearAgo).day === today.day
    ? yearAgo
    : fromIceland({ ...today, month: month + 1, day: 0 });
}
