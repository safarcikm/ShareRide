import { formatMonth, type Locale, type Translate } from "@shareride/i18n";

/** "Member since November 2026", from the year and month they joined. */
export function memberSinceText(
  t: Translate,
  locale: Locale,
  joined: { readonly year: number; readonly month: number },
): string {
  return t("request.memberSince", {
    month: formatMonth(joined.month, locale),
    year: String(joined.year),
  });
}

/** The year and month of a "2026-11" month, as the API sends another person's. */
export function monthOf(yearMonth: string): { readonly year: number; readonly month: number } {
  const [year, month] = yearMonth.split("-").map(Number);
  return { year: year ?? 0, month: month ?? 1 };
}

/** A person's first name, or "A former member" once their data was erased (spec 11, 3.5). */
export function firstNameOf(t: Translate, person: { readonly firstName: string | null }): string {
  return person.firstName ?? t("people.formerMember");
}
