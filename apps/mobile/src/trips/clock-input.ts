// Times the driver types on the time step, read as a clock in Iceland.
import { fromIceland } from "@shareride/domain";
import { addDays, dayOf, type Day } from "@/lib/days";

export interface Clock {
  readonly hour: number;
  readonly minute: number;
}

/**
 * A time as people type it: "9", "930", "0930", "9:30", "09.30" or "9 30",
 * on a 24-hour clock; null when it is not a time.
 */
export function parseClock(text: string): Clock | null {
  const match = /^(\d{1,2})(?:[:.\s]?(\d{2}))?$/u.exec(text.trim());
  if (match === null) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

/** The moment of a clock time on a day in Iceland. */
export const at = (day: Day, clock: Clock): Date => fromIceland({ ...day, ...clock });

/**
 * The first moment at a clock time not before `previous`, so a stop after
 * midnight falls on the next day. The same time as `previous` stays on its
 * day, where the time check says it must be later.
 */
export function onOrAfter(previous: Date, clock: Clock): Date {
  const sameDay = at(dayOf(previous), clock);
  return sameDay < previous ? at(addDays(dayOf(previous), 1), clock) : sameDay;
}
