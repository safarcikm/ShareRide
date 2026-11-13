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
