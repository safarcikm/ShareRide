import { fromIceland, inIceland } from "../time.ts";

/**
 * The same day and time a number of calendar months later (or earlier, when
 * negative), on a clock in Iceland. A day the target month lacks becomes its
 * last day: 31 January plus one month is 28 (or 29) February.
 */
export function addIcelandMonths(moment: Date, months: number): Date {
  const parts = inIceland(moment);
  const target = fromIceland({ ...parts, month: parts.month + months });
  const exact = inIceland(target).day === parts.day;
  const shifted = exact
    ? target
    : fromIceland({ ...parts, month: parts.month + months + 1, day: 0 });
  // inIceland drops seconds; keep them so the result is exactly months apart.
  return new Date(shifted.getTime() + (moment.getTime() % 60_000));
}

export const addDays = (moment: Date, days: number): Date =>
  new Date(moment.getTime() + days * 24 * 3600 * 1000);
