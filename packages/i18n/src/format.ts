import { inIceland, type Money } from "@shareride/domain";
import { monthNames, shortMonthNames, shortWeekdayNames, weekdayNames } from "./calendar-names.ts";
import type { Locale } from "./locales.ts";
import { createTranslator } from "./translator.ts";

const translators = new Map<Locale, ReturnType<typeof createTranslator>>();

function translator(locale: Locale) {
  let t = translators.get(locale);
  if (t === undefined) {
    t = createTranslator(locale);
    translators.set(locale, t);
  }
  return t;
}

/** Thousands and decimal marks: "2.500,5" in Icelandic, "2,500.5" in English. */
const marks: Record<Locale, { group: string; decimal: string }> = {
  is: { group: ".", decimal: "," },
  en: { group: ",", decimal: "." },
};

/**
 * A whole number with its thousands grouped. Done by hand rather than with
 * Intl.NumberFormat, which gives English marks where Icelandic data is missing.
 */
function formatWhole(value: number, locale: Locale): string {
  const digits = String(Math.abs(Math.round(value)));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, marks[locale].group);
  return value < 0 ? `-${grouped}` : grouped;
}

/** Whole krónur: "2.500 kr." in Icelandic, "2,500 ISK" in English (ADR 0011). */
export function formatMoney(money: Money, locale: Locale): string {
  return translator(locale)("format.money", { amount: formatWhole(money.amount, locale) });
}

/**
 * A distance in a straight line or by road: "300 m" under a kilometre (to
 * the nearest 100 m, at least 100 m), "2.4 km" under 10 km, then whole km.
 */
export function formatDistance(metres: number, locale: Locale): string {
  const t = translator(locale);
  if (metres < 950) {
    const distance = formatWhole(Math.max(100, Math.round(metres / 100) * 100), locale);
    return t("format.distanceMetres", { distance });
  }
  if (metres < 9950) {
    // Tenths of a kilometre, with no ",0" on a whole one.
    const tenths = Math.round(metres / 100);
    const whole = String(Math.floor(tenths / 10));
    const distance =
      tenths % 10 === 0 ? whole : `${whole}${marks[locale].decimal}${String(tenths % 10)}`;
    return t("format.distanceKilometres", { distance });
  }
  return t("format.distanceKilometres", { distance: formatWhole(metres / 1000, locale) });
}

/** An average rating to one decimal, always shown: "4.3" or "5.0", "4,3" in Icelandic. */
export function formatRating(average: number, locale: Locale): string {
  const tenths = Math.round(average * 10);
  return `${String(Math.floor(tenths / 10))}${marks[locale].decimal}${String(tenths % 10)}`;
}

/** A month (1 to 12) as it reads inside a sentence: "May", "maí". */
export function formatMonth(month: number, locale: Locale): string {
  const name = monthNames[locale][month - 1];
  if (name === undefined) throw new RangeError(`No month ${String(month)}`);
  return name;
}

/** A day and month: "15 November", "15. nóvember". */
const dayAndMonth = (day: number, month: number, locale: Locale) =>
  `${String(day)}${locale === "is" ? "." : ""} ${formatMonth(month, locale)}`;

/** A calendar date such as 2026-11-14: "14 November 2026", "14. nóvember 2026". */
export function formatDate(date: string, locale: Locale): string {
  const [year, month, day] = date.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError(`Not a date: ${date}`);
  }
  return `${dayAndMonth(day, month, locale)} ${String(year)}`;
}

/** The day of a moment in Iceland, with its weekday: "Sunday 15 November", "sunnudagur 15. nóvember". */
export function formatDay(moment: Date, locale: Locale): string {
  const { year, month, day } = inIceland(moment);
  // getUTCDay counts from Sunday; the names count from Monday.
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  return `${weekdayNames[locale][weekday] ?? ""} ${dayAndMonth(day, month, locale)}`;
}

/**
 * The day and month of a moment in Iceland: "23 November", "23. nóvember".
 * Without a weekday, so it reads right after any Icelandic preposition
 * ("til", "frá"), where a weekday would have to be declined.
 */
export function formatDayAndMonth(moment: Date, locale: Locale): string {
  const { month, day } = inIceland(moment);
  return dayAndMonth(day, month, locale);
}

/** A calendar date such as 2026-11-20, briefly: "Fri 20 Nov", "fös. 20. nóv.". */
export function formatShortDay(date: string, locale: Locale): string {
  const [year, month, day] = date.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new RangeError(`Not a date: ${date}`);
  }
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
  const monthName = shortMonthNames[locale][month - 1] ?? "";
  return `${shortWeekdayNames[locale][weekday] ?? ""} ${String(day)}${locale === "is" ? "." : ""} ${monthName}`;
}

/**
 * Text that starts a line, with a capital first letter: Icelandic writes
 * weekdays and months in lower case, except at the start.
 */
export function capitalised(text: string, locale: Locale): string {
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

/** The time of a moment on a 24-hour clock in Iceland, as both languages write it: "07:05". */
export function formatClock(moment: Date): string {
  const { hour, minute } = inIceland(moment);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** A driving time, to the nearest minute: "45 min", "1 h", "5 h 10 min". */
export function formatDuration(seconds: number, locale: Locale): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const t = translator(locale);
  if (hours === 0) return t("format.minutes", { minutes });
  if (minutes === 0) return t("format.hours", { hours });
  return t("format.hoursMinutes", { hours, minutes });
}

/** Short weekday names from Monday, as a week starts in Iceland: "Mon" to "Sun", "mán." to "sun.". */
export function formatWeekdays(locale: Locale): string[] {
  return [...shortWeekdayNames[locale]];
}
