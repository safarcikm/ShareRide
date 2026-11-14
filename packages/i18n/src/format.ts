import type { Money } from "@shareride/domain";
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

/** Whole krónur: "2.500 kr." in Icelandic, "2,500 ISK" in English (ADR 0011). */
export function formatMoney(money: Money, locale: Locale): string {
  const amount = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(money.amount);
  return translator(locale)("format.money", { amount });
}

/** The language tag for Intl: English dates read "14 November 2026", as in Iceland and the UK. */
const intlLocale = (locale: Locale) => (locale === "en" ? "en-GB" : locale);

/**
 * A distance in a straight line or by road: "300 m" under a kilometre (to
 * the nearest 100 m, at least 100 m), "2.4 km" under 10 km, then whole km.
 */
export function formatDistance(metres: number, locale: Locale): string {
  if (metres < 950) {
    const distance = new Intl.NumberFormat(locale).format(
      Math.max(100, Math.round(metres / 100) * 100),
    );
    return translator(locale)("format.distanceMetres", { distance });
  }
  const kilometres = metres / 1000;
  const distance = new Intl.NumberFormat(locale, {
    maximumFractionDigits: kilometres < 9.95 ? 1 : 0,
  }).format(kilometres);
  return translator(locale)("format.distanceKilometres", { distance });
}

/** A month (1 to 12) as it reads inside a sentence: "May", "maí". */
export function formatMonth(month: number, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { month: "long", timeZone: "UTC" }).format(
    Date.UTC(2026, month - 1, 15),
  );
}

/** A calendar date such as 2026-11-14: "14 November 2026", "14. nóvember 2026". */
export function formatDate(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}
