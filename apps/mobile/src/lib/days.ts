// Calendar days in Iceland, for choosing a trip's date. A day is a date on a
// calendar, not a moment; `noonOf` turns it into one for formatting.
import { fromIceland, inIceland } from "@shareride/domain";

export interface Day {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** The day a moment falls on in Iceland. */
export function dayOf(moment: Date): Day {
  const { year, month, day } = inIceland(moment);
  return { year, month, day };
}

export function addDays(day: Day, count: number): Day {
  const moved = new Date(Date.UTC(day.year, day.month - 1, day.day + count));
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

/** Negative when `a` comes first, 0 for the same day. */
export function compareDays(a: Day, b: Day): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** The weekday of a day, from 0 for Monday to 6 for Sunday. */
export function weekdayOf(day: Day): number {
  return (new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay() + 6) % 7;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Midday of a day in Iceland, a moment safely inside it. */
export function noonOf(day: Day): Date {
  return fromIceland({ ...day, hour: 12, minute: 0 });
}

/** A day as the API writes dates: 2026-11-15. */
export function isoDay(day: Day): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(day.year)}-${pad(day.month)}-${pad(day.day)}`;
}

/** Whether this device's clock shows another time than a clock in Iceland. */
export function showsOtherTime(moment: Date): boolean {
  const iceland = inIceland(moment);
  return iceland.hour !== moment.getHours() || iceland.minute !== moment.getMinutes();
}
