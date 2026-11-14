// Month and weekday names, kept here rather than taken from Intl: phones and
// browsers do not all carry Icelandic calendar data, and without it Intl falls
// back to names such as "M11". Weekdays start on Monday, as a week does in
// Iceland.
import type { Locale } from "./locales.ts";

/** Months as they read inside a sentence, January first. */
export const monthNames: Record<Locale, readonly string[]> = {
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
  is: [
    "janúar",
    "febrúar",
    "mars",
    "apríl",
    "maí",
    "júní",
    "júlí",
    "ágúst",
    "september",
    "október",
    "nóvember",
    "desember",
  ],
};

/** Weekdays as they read inside a sentence, Monday first. */
export const weekdayNames: Record<Locale, readonly string[]> = {
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  is: [
    "mánudagur",
    "þriðjudagur",
    "miðvikudagur",
    "fimmtudagur",
    "föstudagur",
    "laugardagur",
    "sunnudagur",
  ],
};

/** Short weekday names for a calendar's column heads, Monday first. */
export const shortWeekdayNames: Record<Locale, readonly string[]> = {
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  is: ["mán.", "þri.", "mið.", "fim.", "fös.", "lau.", "sun."],
};

/** Short month names for brief dates such as "Fri 20 Nov", January first. */
export const shortMonthNames: Record<Locale, readonly string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  is: [
    "jan.",
    "feb.",
    "mar.",
    "apr.",
    "maí",
    "jún.",
    "júl.",
    "ágú.",
    "sep.",
    "okt.",
    "nóv.",
    "des.",
  ],
};
