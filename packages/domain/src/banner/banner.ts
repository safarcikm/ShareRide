// The front page's banner through the year (spec 36, 3.2 to 3.5; R36.2):
// which season the Iceland scene is drawn in on a date, and which festive
// day, if any, dresses it up. Pure: the caller gives Iceland's date.

/** The seasons as Iceland looks (spec 36, 3.3), in the year's order from winter. */
export const bannerSeasons = ["winter", "spring", "summer", "autumn"] as const;
export type BannerSeason = (typeof bannerSeasons)[number];

/** The big days (3.4), then the smaller ones (3.5). */
export const bannerDays = [
  "christmas",
  "newyear",
  "easter",
  "summerday",
  "june17",
  "longweekend",
  "winterday",
  "dec1",
  "bondadagur",
  "konudagur",
  "bolludagur",
  "oskudagur",
  "seafarers",
] as const;
export type BannerDay = (typeof bannerDays)[number];

/** A day on the calendar: month 1 to 12, day 1 to 31. */
export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/**
 * What the banner shows: the season its scene is drawn in, which is the
 * day's own (3.4) or else the date's, and the festive day, if any.
 */
export interface Banner {
  readonly season: BannerSeason;
  readonly day: BannerDay | null;
}

const dayMs = 86_400_000;
const sunday = 0;
const monday = 1;
const thursday = 4;
const friday = 5;
const saturday = 6;

/** A date as days since 1970, for counting; UTC has no daylight saving. */
const count = ({ year, month, day }: CalendarDate) => Date.UTC(year, month - 1, day) / dayMs;
const weekdayOf = (days: number) => new Date(days * dayMs).getUTCDay();

/** The first date from `from` to `to` in a month that falls on a weekday. */
function weekdayBetween(year: number, month: number, from: number, to: number, weekday: number) {
  for (let day = from; day <= to; day += 1) {
    const days = count({ year, month, day });
    if (weekdayOf(days) === weekday) return days;
  }
  // Every run of seven days has every weekday.
  throw new Error("No such weekday");
}

/** Easter Sunday in the Gregorian calendar (the anonymous algorithm). */
export function easterSunday(year: number): CalendarDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

/** The first day of winter: the Saturday between 21 and 27 October. */
const firstDayOfWinter = (year: number) => weekdayBetween(year, 10, 21, 27, saturday);

/**
 * Seafarers' Day: the first Sunday in June, or the second when the first
 * is Whitsunday, seven weeks after Easter (Act 20/1987).
 */
function seafarersDay(year: number, easter: number) {
  const first = weekdayBetween(year, 6, 1, 7, sunday);
  return first === easter + 49 ? first + 7 : first;
}

interface Span {
  readonly day: BannerDay;
  readonly from: number;
  readonly to: number;
}

/**
 * A year's festive days, in the order that wins when two fall together:
 * a day of one date before a longer one (3.2).
 */
function daysOf(year: number): readonly Span[] {
  const easter = count(easterSunday(year));
  const commerceMonday = weekdayBetween(year, 8, 1, 7, monday);
  const on = (day: BannerDay, date: number): Span => ({ day, from: date, to: date });
  const at = (month: number, day: number) => count({ year, month, day });
  return [
    on("newyear", at(1, 1)),
    on("newyear", at(12, 31)),
    on("dec1", at(12, 1)),
    on("june17", at(6, 17)),
    on("summerday", weekdayBetween(year, 4, 19, 25, thursday)),
    on("winterday", firstDayOfWinter(year)),
    on("bondadagur", weekdayBetween(year, 1, 19, 25, friday)),
    on("konudagur", weekdayBetween(year, 2, 18, 24, sunday)),
    on("bolludagur", easter - 48),
    on("oskudagur", easter - 46),
    on("seafarers", seafarersDay(year, easter)),
    // Maundy Thursday to Easter Monday.
    { day: "easter", from: easter - 3, to: easter + 1 },
    // From the Wednesday before the first Monday in August, when people
    // look for rides for it, to that Monday.
    { day: "longweekend", from: commerceMonday - 5, to: commerceMonday },
    // From the first Yule Lad to Þrettándinn, around the new year.
    { day: "christmas", from: at(1, 2), to: at(1, 6) },
    { day: "christmas", from: at(12, 12), to: at(12, 30) },
  ];
}

/** The scene each day is drawn in (3.4 and 3.5). */
const sceneOf: Record<BannerDay, BannerSeason> = {
  christmas: "winter",
  newyear: "winter",
  easter: "spring",
  summerday: "spring",
  june17: "summer",
  longweekend: "summer",
  // Autumn's land, which turns white as its moment.
  winterday: "autumn",
  dec1: "winter",
  bondadagur: "winter",
  konudagur: "winter",
  bolludagur: "winter",
  oskudagur: "winter",
  seafarers: "summer",
};

/** The season of a date: winter from the first day of winter to 31 March. */
function seasonOf(date: CalendarDate): BannerSeason {
  if (date.month <= 3 || count(date) >= firstDayOfWinter(date.year)) return "winter";
  if (date.month <= 5) return "spring";
  if (date.month <= 8) return "summer";
  return "autumn";
}

/**
 * What the banner shows on a date in Iceland (R36.2): the festive day, if
 * the operator has them on and one falls on it, in its own scene, or else
 * the season.
 */
export function bannerFor(date: CalendarDate, options: { readonly festiveDays: boolean }): Banner {
  if (options.festiveDays) {
    const today = count(date);
    const found = daysOf(date.year).find(({ from, to }) => today >= from && today <= to);
    if (found !== undefined) return { season: sceneOf[found.day], day: found.day };
  }
  return { season: seasonOf(date), day: null };
}

const written = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A date written YYYY-MM-DD, as `?day=` gives it (3.9), or null for
 * anything else, a date that does not exist, or a year outside 2000 to
 * 2099.
 */
export function parseCalendarDate(text: string): CalendarDate | null {
  const parts = written.exec(text);
  if (parts === null) return null;
  const [year, month, day] = parts.slice(1).map(Number) as [number, number, number];
  if (year < 2000 || year > 2099) return null;
  const real = new Date(Date.UTC(year, month - 1, day));
  if (real.getUTCMonth() !== month - 1 || real.getUTCDate() !== day) return null;
  return { year, month, day };
}
