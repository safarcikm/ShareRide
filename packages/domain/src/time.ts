// Time is stored in UTC and shown in Iceland time (conventions). Iceland
// keeps UTC all year today; the time zone database is used anyway, so a
// change to Iceland's clocks needs no code change.

export const icelandTimeZone = "Atlantic/Reykjavik";

export interface CalendarParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: icelandTimeZone,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

/** The date and time of a moment on a clock in Iceland. */
export function inIceland(moment: Date): CalendarParts {
  const parts = Object.fromEntries(
    formatter.formatToParts(moment).map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts["year"] ?? 0,
    month: parts["month"] ?? 0,
    day: parts["day"] ?? 0,
    hour: parts["hour"] ?? 0,
    minute: parts["minute"] ?? 0,
  };
}
