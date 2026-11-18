import { startOfIcelandDay } from "../time.ts";

// ISO weeks in Iceland time (spec 10, 3.4.2): a week runs from Monday
// 00:00 to the next Monday, and belongs to the year its Thursday is in.

export interface IsoWeek {
  readonly year: number;
  /** 1 to 53. */
  readonly week: number;
}

const dayMs = 24 * 60 * 60 * 1000;
const weekMs = 7 * dayMs;

/** The Monday 00:00, Iceland time, of the week a moment is in. */
export function weekStartOf(moment: Date): Date {
  const day = startOfIcelandDay(moment);
  // Iceland keeps UTC all year, so its weekday is the UTC one of its day's start.
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - sinceMonday * dayMs);
}

/** The ISO week a moment is in. */
export function isoWeekOf(moment: Date): IsoWeek {
  const monday = weekStartOf(moment);
  const thursday = new Date(monday.getTime() + 3 * dayMs);
  const year = thursday.getUTCFullYear();
  const firstThursdayWeek = weekStartOf(new Date(Date.UTC(year, 0, 4)));
  return { year, week: Math.round((monday.getTime() - firstThursdayWeek.getTime()) / weekMs) + 1 };
}

/** The Monday 00:00 a week starts at. */
export function startOfIsoWeek({ year, week }: IsoWeek): Date {
  const first = weekStartOf(new Date(Date.UTC(year, 0, 4)));
  return new Date(first.getTime() + (week - 1) * weekMs);
}

/** When a week ends: the next Monday 00:00. */
export function endOfIsoWeek(week: IsoWeek): Date {
  return new Date(startOfIsoWeek(week).getTime() + weekMs);
}

/** The week `count` weeks after (or, negative, before) a week. */
export function addIsoWeeks(week: IsoWeek, count: number): IsoWeek {
  return isoWeekOf(new Date(startOfIsoWeek(week).getTime() + count * weekMs));
}

/** Whether a year has this week: 52 or 53 of them. */
export function isIsoWeek({ year, week }: IsoWeek): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1) return false;
  const found = isoWeekOf(startOfIsoWeek({ year, week }));
  return found.year === year && found.week === week;
}

/** "2026-W07", as the console's routes take a week. */
export function formatIsoWeek({ year, week }: IsoWeek): string {
  return `${String(year)}-W${String(week).padStart(2, "0")}`;
}

/** The week "2026-W07" names, or null. */
export function parseIsoWeek(text: string): IsoWeek | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(text);
  if (match === null) return null;
  const week = { year: Number(match[1]), week: Number(match[2]) };
  return isIsoWeek(week) ? week : null;
}

/** -1, 0 or 1 as `a` is before, the same as or after `b`. */
export function compareIsoWeeks(a: IsoWeek, b: IsoWeek): number {
  return Math.sign(a.year - b.year || a.week - b.week);
}

/** The weeks from `first` to `last`, both included; none when `last` is before `first`. */
export function isoWeeksBetween(first: IsoWeek, last: IsoWeek): IsoWeek[] {
  const weeks: IsoWeek[] = [];
  for (let week = first; compareIsoWeeks(week, last) <= 0; week = addIsoWeeks(week, 1)) {
    weeks.push(week);
  }
  return weeks;
}
