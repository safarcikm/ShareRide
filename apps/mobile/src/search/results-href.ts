import type { Locale } from "@shareride/i18n";
import type { Href } from "expo-router";
import type { SearchQuery } from "./recent-searches";

/**
 * The address parameters of a search's results. The names travel with the
 * IDs, in the language of the moment, so the screen can show them after a
 * reload. Any day leaves the date out.
 */
export function resultsParams(query: SearchQuery, locale: Locale) {
  return {
    from: query.from.id,
    to: query.to.id,
    fromName: query.from.name[locale],
    toName: query.to.name[locale],
    seats: String(query.seats),
    date: query.date ?? undefined,
  };
}

/** The results screen for a search. */
export function resultsHref(query: SearchQuery, locale: Locale): Href {
  const { date, ...params } = resultsParams(query, locale);
  return {
    pathname: "/search/results",
    params: date === undefined ? params : { ...params, date },
  };
}
